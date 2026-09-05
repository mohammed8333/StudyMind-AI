import json
import logging
import math
import re
import httpx
from typing import List, Dict, Any, Optional, Set
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.config import settings
from app.models.document import DocumentChunk
from app.services.arabic_nlp import normalize_arabic

logger = logging.getLogger(__name__)

ARABIC_STOPWORDS: Set[str] = {
    "ما", "هي", "هو", "هم", "هن", "ماذا", "من", "في", "على", "عن", "مع",
    "هل", "كيف", "لماذا", "اشرح", "اشرحلي", "وضح", "وضحلي", "بسيط", "جدا",
    "اريد", "عايز", "اعطني", "هات", "درس", "صفحة", "رقم", "يعني", "ايه",
    "الدرس", "الكتاب", "المذكرة", "هذا", "هذه", "ذلك", "تلك", "التي", "الذي",
    "الذين", "كان", "يكون", "سيكون", "الى", "إلى", "ثم", "أو", "او"
}

def extract_meaningful_terms(text: str) -> List[str]:
    """Extracts significant keywords excluding Arabic conversational stopwords."""
    norm = normalize_arabic(text)
    # Tokenize words, numbers, and Latin identifiers (like CLI, print, python, nova)
    tokens = re.findall(r'[\u0600-\u06FF\w]+', norm)
    meaningful = [t for t in tokens if t not in ARABIC_STOPWORDS and len(t) > 1]
    return meaningful if meaningful else tokens

async def get_embedding(text: str) -> List[float]:
    """
    Generate embedding for text using configured provider (Gemini, Ollama, or local fallback).
    """
    clean_text = text.strip()
    if not clean_text:
        return [0.0] * settings.EMBEDDING_DIMENSION
        
    provider = settings.EMBEDDING_PROVIDER.lower()
    
    # 1. Gemini Embeddings
    if provider == "gemini" and settings.GEMINI_API_KEY:
        try:
            url = "https://generativelanguage.googleapis.com/v1beta/models/text-embedding-004:embedContent"
            headers = {
                "x-goog-api-key": settings.GEMINI_API_KEY,
                "Content-Type": "application/json"
            }
            payload = {
                "model": "models/text-embedding-004",
                "content": {"parts": [{"text": clean_text[:2048]}]}
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    return data.get("embedding", {}).get("values", [])
        except Exception as e:
            logger.warning(f"Gemini embedding failed: {e}")

    # 2. Ollama Embeddings
    if provider == "ollama":
        try:
            url = f"{settings.OLLAMA_BASE_URL}/api/embeddings"
            payload = {
                "model": settings.OLLAMA_MODEL,
                "prompt": clean_text
            }
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return res.json().get("embedding", [])
        except Exception as e:
            logger.warning(f"Ollama embedding failed: {e}")

    # 3. High-Quality Deterministic Character Hash Vector Fallback
    dim = settings.EMBEDDING_DIMENSION
    vec = [0.0] * dim
    words = clean_text.split()
    for i, word in enumerate(words):
        h = 0
        for ch in word:
            h = (h * 31 + ord(ch)) % dim
        weight = 1.0 / math.sqrt(i + 1)
        vec[h] += weight
        
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [x / norm for x in vec]
    return vec

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Computes cosine similarity between two float vectors."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot = sum(a * b for a, b in zip(v1, v2))
    norm_a = math.sqrt(sum(a * a for a in v1))
    norm_b = math.sqrt(sum(b * b for b in v2))
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return dot / (norm_a * norm_b)

async def search_relevant_chunks(
    db: AsyncSession,
    document_id: int,
    query: str,
    top_k: int = 8,
    target_page: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    High-Precision BM25 / Lexical Ranker for Arabic Educational RAG:
    1. Extracts significant keywords (terms, code identifiers, Arabic concepts).
    2. Calculates Inverse Document Frequency (IDF) to give immense weight to unique terms (e.g. 'قول', 'مسمار', 'F=ma').
    3. Rewards exact multi-word phrase matches.
    4. Boosts target page if the student specified a page or is actively viewing it.
    5. Returns top_k rich chunks (default 8) to provide the LLM with full context.
    """
    normalized_query = normalize_arabic(query)
    query_terms = extract_meaningful_terms(query)
    
    # Query all chunks for this document
    stmt = select(DocumentChunk).where(DocumentChunk.document_id == document_id)
    if target_page is not None:
        # Include target page chunks plus neighboring pages for context
        stmt = stmt.where(DocumentChunk.page_number.between(max(1, target_page - 2), target_page + 2))
        
    result = await db.execute(stmt)
    chunks = result.scalars().all()
    if not chunks:
        return []
        
    N = len(chunks)
    
    # Calculate Document Frequency (DF) across chunks
    doc_freq: Dict[str, int] = {}
    for c in chunks:
        unique_chunk_words = set(re.findall(r'[\u0600-\u06FF\w]+', c.content_normalized))
        for w in unique_chunk_words:
            doc_freq[w] = doc_freq.get(w, 0) + 1
            
    scored_chunks: List[Dict[str, Any]] = []
    
    for chunk in chunks:
        c_norm = chunk.content_normalized
        score = 0.0
        
        # 1. Exact phrase match bonus
        if len(normalized_query) > 4 and normalized_query in c_norm:
            score += 10.0
            
        # 2. BM25 / IDF Term Scoring
        chunk_words = re.findall(r'[\u0600-\u06FF\w]+', c_norm)
        chunk_len = max(1, len(chunk_words))
        
        for term in query_terms:
            count = c_norm.count(term)
            if count > 0:
                df = doc_freq.get(term, 1)
                # Standard BM25 IDF
                idf = math.log((N - df + 0.5) / (df + 0.5) + 1.0)
                # Term frequency saturation
                tf = (count * 2.2) / (count + 1.2 * (0.75 + 0.25 * (chunk_len / 200.0)))
                score += tf * max(1.0, idf)
                
        # 3. Target page priority boost
        if target_page is not None:
            if chunk.page_number == target_page:
                score += 8.0
            elif abs(chunk.page_number - target_page) == 1:
                score += 3.0
                
        scored_chunks.append({
            "chunk_id": chunk.id,
            "page_number": chunk.page_number,
            "chapter": chunk.chapter or "عام",
            "section_title": chunk.section_title or "",
            "content": chunk.content,
            "score": score
        })
        
    # Sort descending by score
    scored_chunks.sort(key=lambda x: x["score"], reverse=True)
    return scored_chunks[:top_k]
