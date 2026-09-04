import json
import logging
import re
import asyncio
import httpx
from typing import List, Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

def clean_think_tags(text: str) -> str:
    """Removes internal reasoning <think>...</think> tags if present in model output."""
    if not text:
        return ""
    # If there is a closing </think>, take whatever is after it
    if "</think>" in text:
        after_think = text.split("</think>")[-1].strip()
        if after_think:
            return after_think
    # If there is an unclosed <think>, remove it
    cleaned = re.sub(r'<think>.*?</think>', '', text, flags=re.DOTALL).strip()
    cleaned = re.sub(r'</?think>', '', cleaned).strip()
    return cleaned if cleaned else text

async def call_llm(
    prompt: str,
    system_instruction: Optional[str] = None,
    json_mode: bool = False,
    temperature: float = 0.2
) -> str:
    """
    Unified LLM call supporting:
    - Groq (Ultra-Fast 120B with automatic Rate-Limit retry and compound failover)
    - Google Gemini API
    - OpenRouter (Free community models)
    - Local Ollama
    - Graceful pedagogical message
    """
    provider = settings.LLM_PROVIDER.lower()
    
    # Auto-detection: If configured provider has no key, but another provider has a key, auto-switch!
    if provider == "gemini" and not settings.GEMINI_API_KEY:
        if settings.GROQ_API_KEY:
            provider = "groq"
        elif settings.OPENROUTER_API_KEY:
            provider = "openrouter"
            
    # 1. Groq Cloud (Super Fast with Rate-Limit Resilience)
    if provider == "groq" and settings.GROQ_API_KEY:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            payload: Dict[str, Any] = {
                "model": settings.GROQ_MODEL,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": 3500,
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
                
            headers = {
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json"
            }
            
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(url, json=payload, headers=headers)
                
                # Success
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        raw_content = choices[0].get("message", {}).get("content", "")
                        return clean_think_tags(raw_content)
                        
                # Handle 429 Rate Limit gracefully
                elif res.status_code == 429:
                    logger.warning("Groq 429 (Rate Limit). Attempting auto-backoff and failover...")
                    # Try brief sleep if token reset is small
                    await asyncio.sleep(4.0)
                    retry_res = await client.post(url, json=payload, headers=headers)
                    if retry_res.status_code == 200:
                        choices = retry_res.json().get("choices", [])
                        if choices:
                            return clean_think_tags(choices[0].get("message", {}).get("content", ""))
                            
                    # Failover to groq/compound (70,000 TPM limit)
                    logger.info("Failing over to groq/compound (70k TPM tier)...")
                    payload["model"] = "groq/compound"
                    fb_res = await client.post(url, json=payload, headers=headers)
                    if fb_res.status_code == 200:
                        choices = fb_res.json().get("choices", [])
                        if choices:
                            return clean_think_tags(choices[0].get("message", {}).get("content", ""))
                            
                else:
                    logger.warning(f"Groq API returned status {res.status_code}: {res.text}")
                    
        except Exception as e:
            logger.error(f"Error calling Groq: {e}")

    # 2. OpenRouter (Free community models)
    if provider == "openrouter" and settings.OPENROUTER_API_KEY:
        try:
            url = "https://openrouter.ai/api/v1/chat/completions"
            messages = []
            if system_instruction:
                messages.append({"role": "system", "content": system_instruction})
            messages.append({"role": "user", "content": prompt})
            
            payload: Dict[str, Any] = {
                "model": settings.OPENROUTER_MODEL,
                "messages": messages,
                "temperature": temperature,
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}
                
            headers = {
                "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
                "Content-Type": "application/json"
            }
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        raw_content = choices[0].get("message", {}).get("content", "")
                        return clean_think_tags(raw_content)
                else:
                    logger.warning(f"OpenRouter API returned {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Error calling OpenRouter: {e}")

    # 3. Google Gemini API
    if provider == "gemini" and settings.GEMINI_API_KEY:
        try:
            model = settings.GEMINI_MODEL
            url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={settings.GEMINI_API_KEY}"
            
            contents = []
            if system_instruction:
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"[تعليمات النظام للمعلم الذكي]: {system_instruction}"}]
                })
                contents.append({
                    "role": "model",
                    "parts": [{"text": "مفهوم، أنا جاهز لتدريس وشرح المادة للطالب باللغة العربية بحسب التعليمات بدقة."}]
                })
                
            contents.append({
                "role": "user",
                "parts": [{"text": prompt}]
            })
            
            payload: Dict[str, Any] = {
                "contents": contents,
                "generationConfig": {
                    "temperature": temperature,
                }
            }
            if json_mode:
                payload["generationConfig"]["responseMimeType"] = "application/json"
                
            async with httpx.AsyncClient(timeout=45.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    candidates = data.get("candidates", [])
                    if candidates:
                        parts = candidates[0].get("content", {}).get("parts", [])
                        if parts:
                            return parts[0].get("text", "")
                else:
                    logger.warning(f"Gemini API returned status {res.status_code}: {res.text}")
        except Exception as e:
            logger.error(f"Error calling Gemini: {e}")

    # 4. Local Ollama API
    if provider == "ollama":
        try:
            url = f"{settings.OLLAMA_BASE_URL}/api/generate"
            payload = {
                "model": settings.OLLAMA_MODEL,
                "prompt": prompt,
                "system": system_instruction or "",
                "stream": False,
                "options": {
                    "temperature": temperature
                }
            }
            if json_mode:
                payload["format"] = "json"
                
            async with httpx.AsyncClient(timeout=60.0) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return res.json().get("response", "")
        except Exception as e:
            logger.error(f"Error calling Ollama: {e}")

    # 5. Fallback Mock when no provider is configured OR temporary rate limit
    logger.info("Using Built-in Pedagogical Fallback Generator.")
    if json_mode:
        return "{}"
        
    if settings.GROQ_API_KEY or settings.GEMINI_API_KEY:
        return "عذراً يا بطل، واجه المعلم ضغطاً مؤقتاً في طلبات الذكاء الاصطناعي (Rate Limit). يرجى الانتظار بضع ثوانٍ ثم الضغط على السؤال مرة أخرى وسيتم الرد عليك فوراً."
        
    return "مرحباً بك! أنا معلّمك الذكي في StudyMind AI. يرجى تفعيل مفتاح API (مثل Groq أو Gemini) في ملف .env للربط مع أحدث نماذج الذكاء الاصطناعي."
