import json
import logging
import re
import asyncio
import httpx
from typing import List, Dict, Any, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

# List of high-performance Groq models to try in order of capability & speed
GROQ_MODELS_POOL = [
    "openai/gpt-oss-120b",
    "groq/compound",
    "groq/compound-mini",
    "allam-2-7b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
]

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

async def _try_groq(
    prompt: Optional[str],
    system_instruction: Optional[str],
    json_mode: bool,
    temperature: float,
    max_tokens: int,
    messages_list: Optional[List[Dict[str, str]]] = None
) -> Optional[str]:
    """Tries Groq models with automatic fallback across the model pool if 404 or 429 occurs."""
    if not settings.GROQ_API_KEY:
        return None

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json"
    }

    if messages_list:
        messages = list(messages_list)
        if system_instruction and not any(m.get("role") == "system" for m in messages):
            messages.insert(0, {"role": "system", "content": system_instruction})
    else:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt or ""})

    # Prepare prioritized models: configured GROQ_MODEL first, followed by available pool
    models_to_try = []
    if settings.GROQ_MODEL and settings.GROQ_MODEL.strip():
        models_to_try.append(settings.GROQ_MODEL.strip())
    for m in GROQ_MODELS_POOL:
        if m not in models_to_try:
            models_to_try.append(m)

    async with httpx.AsyncClient(timeout=45.0) as client:
        for model_name in models_to_try:
            payload: Dict[str, Any] = {
                "model": model_name,
                "messages": messages,
                "temperature": temperature,
                "max_tokens": max_tokens,
            }
            if json_mode:
                payload["response_format"] = {"type": "json_object"}

            try:
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        raw = choices[0].get("message", {}).get("content", "")
                        return clean_think_tags(raw)
                elif res.status_code == 429:
                    logger.warning(f"Groq 429 (Rate Limit) on '{model_name}'. Trying next backup model immediately...")
                    await asyncio.sleep(1.0)
                    continue
                elif res.status_code in [400, 404]:
                    logger.warning(f"Groq model '{model_name}' unavailable ({res.status_code}). Switching to next model...")
                    continue
                else:
                    logger.warning(f"Groq '{model_name}' returned status {res.status_code}: {res.text[:150]}")
                    continue
            except Exception as e:
                logger.error(f"Error calling Groq model '{model_name}': {e}")
                continue

    return None

async def _try_gemini(
    prompt: Optional[str],
    system_instruction: Optional[str],
    json_mode: bool,
    temperature: float,
    max_tokens: int,
    messages_list: Optional[List[Dict[str, str]]] = None
) -> Optional[str]:
    """Calls Google Gemini API with valid models and token limits."""
    if not settings.GEMINI_API_KEY:
        return None

    model = settings.GEMINI_MODEL or "gemini-1.5-flash"
    if "gemini-3" in model:
        model = "gemini-1.5-flash"

    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    headers = {
        "x-goog-api-key": settings.GEMINI_API_KEY,
        "Content-Type": "application/json"
    }
    
    contents = []
    if system_instruction:
        contents.append({
            "role": "user",
            "parts": [{"text": f"[تعليمات المعلم الذكي]: {system_instruction}"}]
        })
        contents.append({
            "role": "model",
            "parts": [{"text": "مفهوم، أنا جاهز للشرح والتدريس للطالب باللغة العربية بحسب التعليمات بدقة."}]
        })
    if messages_list:
        for m in messages_list:
            role = "user" if m.get("role") in ["user", "system"] else "model"
            contents.append({
                "role": role,
                "parts": [{"text": m.get("content", "")}]
            })
    else:
        contents.append({
            "role": "user",
            "parts": [{"text": prompt or ""}]
        })

    payload: Dict[str, Any] = {
        "contents": contents,
        "generationConfig": {
            "temperature": temperature,
            "maxOutputTokens": max_tokens,
        }
    }
    if json_mode:
        payload["generationConfig"]["responseMimeType"] = "application/json"

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(url, headers=headers, json=payload)
            if res.status_code == 200:
                data = res.json()
                candidates = data.get("candidates", [])
                if candidates:
                    parts = candidates[0].get("content", {}).get("parts", [])
                    if parts:
                        return clean_think_tags(parts[0].get("text", ""))
            else:
                logger.warning(f"Gemini API returned status {res.status_code}: {res.text[:150]}")
    except Exception as e:
        logger.error(f"Error calling Gemini: {e}")

    return None

async def _try_openrouter(
    prompt: Optional[str],
    system_instruction: Optional[str],
    json_mode: bool,
    temperature: float,
    max_tokens: int,
    messages_list: Optional[List[Dict[str, str]]] = None
) -> Optional[str]:
    """Calls OpenRouter free / community models."""
    if not settings.OPENROUTER_API_KEY:
        return None

    url = "https://openrouter.ai/api/v1/chat/completions"
    if messages_list:
        messages = list(messages_list)
        if system_instruction and not any(m.get("role") == "system" for m in messages):
            messages.insert(0, {"role": "system", "content": system_instruction})
    else:
        messages = []
        if system_instruction:
            messages.append({"role": "system", "content": system_instruction})
        messages.append({"role": "user", "content": prompt or ""})

    payload: Dict[str, Any] = {
        "model": settings.OPENROUTER_MODEL,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    headers = {
        "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
        "Content-Type": "application/json"
    }
    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            res = await client.post(url, json=payload, headers=headers)
            if res.status_code == 200:
                choices = res.json().get("choices", [])
                if choices:
                    return clean_think_tags(choices[0].get("message", {}).get("content", ""))
            else:
                logger.warning(f"OpenRouter API returned {res.status_code}: {res.text[:150]}")
    except Exception as e:
        logger.error(f"Error calling OpenRouter: {e}")

    return None

async def _try_ollama(
    prompt: Optional[str],
    system_instruction: Optional[str],
    json_mode: bool,
    temperature: float,
    messages_list: Optional[List[Dict[str, str]]] = None
) -> Optional[str]:
    """Calls local Ollama API."""
    url = f"{settings.OLLAMA_BASE_URL}/api/generate"
    effective_prompt = prompt or ""
    if messages_list:
        effective_prompt = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages_list])

    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": effective_prompt,
        "system": system_instruction or "",
        "stream": False,
        "options": {"temperature": temperature}
    }
    if json_mode:
        payload["format"] = "json"

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            res = await client.post(url, json=payload)
            if res.status_code == 200:
                return res.json().get("response", "")
    except Exception as e:
        logger.error(f"Error calling Ollama: {e}")

    return None

async def call_llm(
    prompt: Optional[str] = None,
    system_instruction: Optional[str] = None,
    json_mode: bool = False,
    temperature: float = 0.2,
    max_tokens: int = 1500,
    messages: Optional[List[Dict[str, str]]] = None,
    system_prompt: Optional[str] = None,
) -> str:
    """
    Unified LLM call supporting:
    - Single prompt string or multi-turn messages array
    - Groq (with automatic multi-model resilient fallback cascade)
    - Google Gemini API (with auto-failover)
    - OpenRouter (Free community models)
    - Local Ollama
    """
    effective_system = system_instruction or system_prompt
    effective_prompt = prompt or (messages[-1]["content"] if messages and len(messages) > 0 else "")

    provider = settings.LLM_PROVIDER.lower()

    # Step 1: Attempt primary configured provider
    result: Optional[str] = None
    if provider == "groq":
        result = await _try_groq(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)
        if not result and settings.GEMINI_API_KEY:
            logger.info("Groq unavailable, failing over to Gemini...")
            result = await _try_gemini(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)
    elif provider == "gemini":
        result = await _try_gemini(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)
        if not result and settings.GROQ_API_KEY:
            logger.info("Gemini unavailable, failing over to Groq...")
            result = await _try_groq(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)
    elif provider == "openrouter":
        result = await _try_openrouter(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)
        if not result and settings.GROQ_API_KEY:
            result = await _try_groq(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)
    elif provider == "ollama":
        result = await _try_ollama(effective_prompt, effective_system, json_mode, temperature, messages_list=messages)

    # Step 2: If primary didn't succeed, try any other configured provider
    if not result:
        if settings.GROQ_API_KEY and provider != "groq":
            result = await _try_groq(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)
        if not result and settings.GEMINI_API_KEY and provider != "gemini":
            result = await _try_gemini(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)
        if not result and settings.OPENROUTER_API_KEY and provider != "openrouter":
            result = await _try_openrouter(effective_prompt, effective_system, json_mode, temperature, max_tokens, messages_list=messages)

    if result:
        return result

    # Step 3: Fallback Mock if all providers failed
    logger.warning("All LLM providers exhausted. Returning fallback message.")
    if json_mode:
        return "{}"

    if settings.GROQ_API_KEY or settings.GEMINI_API_KEY:
        return "عذراً يا بطل، واجه المعلم ضغطاً مؤقتاً في طلبات الذكاء الاصطناعي (Rate Limit). يرجى الانتظار بضع ثوانٍ ثم الضغط على السؤال مرة أخرى وسيتم الرد عليك فوراً."

    return "مرحباً بك! أنا معلّمك الذكي في StudyMind AI. يرجى تفعيل مفتاح API (مثل Groq أو Gemini) في إعدادات المنصة للربط مع أحدث نماذج الذكاء الاصطناعي."
