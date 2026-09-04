import re
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.services.vector_store import search_relevant_chunks
from app.services.llm_adapter import call_llm
from app.schemas.tutor import ExplanationLevel, SourceCitation, TutorResponse

LEVEL_PROMPTS = {
    ExplanationLevel.VERY_SIMPLE: (
        "أسلوب الشرح: [بسيط جداً - أسلوب فاينمان]. "
        "بسّط الفكرة لأقصى درجة، واستخدم تشبيهات من الحياة اليومية والقصص البسيطة. "
        "تجنب الكلمات المعقدة واشرح وكأنك تتحدث مع طالب في بداية تعلّمه للمادة."
    ),
    ExplanationLevel.MEDIUM: (
        "أسلوب الشرح: [متوسط ومتزن]. "
        "قدم شرحاً تدريجياً منظماً خطوة بخطوة، مع إبراز الفكرة الرئيسية والأمثلة التوضيحية."
    ),
    ExplanationLevel.TEXTBOOK: (
        "أسلوب الشرح: [مستوى الكتاب والمدرسة]. "
        "التزم بدقة بنص التعريفات والقوانين الواردة في المنهج والكتاب. "
        "ركز على الصياغة النموذجية المطلوبة في ورقة الامتحان."
    ),
    ExplanationLevel.ADVANCED: (
        "أسلوب الشرح: [متقدم وعميق للمتفوقين]. "
        "اشرح الاستنتاجات، البراهين، الحالات الشاذة أو الخاصة، واربط بين هذا الموضوع والموضوعات الأخرى في المنهج."
    ),
}

def clean_body_text(text: str, pages_str: str) -> str:
    """Cleans all raw markdown symbols (backticks, code blocks, tables, asterisks) and scattered inline citations."""
    # 1. Remove code blocks ```text or ```
    text = re.sub(r'```[a-zA-Z0-9_-]*\n?', '', text)
    text = re.sub(r'```', '', text)
    
    # 2. Convert inline backticks `code` into clean plain quotes "code"
    text = re.sub(r'`([^`\n]+)`', r'"\1"', text)
    text = re.sub(r'`', '', text)

    # 3. Remove scattered inline citations like [المصدر: ص 2] or (صفحة 2) or [صفحة 2]
    text = re.sub(r'\[(?:المصدر:?\s*)?ص(?:فحة)?\s*\d+\]', '', text)
    text = re.sub(r'\((?:المصدر:?\s*)?ص(?:فحة)?\s*\d+\)', '', text)
    text = re.sub(r'\[صفحة\s*\d+\]', '', text)
    text = re.sub(r'\(صفحة\s*\d+\)', '', text)
    
    # 4. Strip markdown header hashes and horizontal rules
    text = re.sub(r'^#{1,6}\s*', '', text, flags=re.MULTILINE)
    text = re.sub(r'^\s*[-*_]{3,}\s*$', '', text, flags=re.MULTILINE)
    
    # 5. Clean markdown bold/italic asterisks
    text = re.sub(r'\*\*(.*?)\*\*', r'\1', text)
    text = re.sub(r'\*(.*?)\*', r'\1', text)
    
    # 6. Convert markdown tables into clean bulleted text lines
    lines = []
    for line in text.splitlines():
        line_str = line.strip()
        if not line_str:
            lines.append('')
            continue
        # Table header separator |---|---|
        if re.match(r'^\|?[\s\-:|]+\|?$', line_str):
            continue
        # Table row | col1 | col2 |
        if line_str.startswith('|') and line_str.endswith('|'):
            cells = [c.strip() for c in line_str.split('|')[1:-1] if c.strip()]
            if cells:
                lines.append('• ' + ' - '.join(cells))
            continue
        lines.append(line_str)
        
    cleaned = '\n'.join(lines).strip()
    
    # 7. Remove any trailing raw references header if already there
    cleaned = re.sub(r'(?:المصادر المعتمدة|المراجع).*$', '', cleaned, flags=re.MULTILINE).strip()
    
    # 8. Append references cleanly at the very bottom line
    if pages_str:
        cleaned += f"\n\n📚 المراجع المعتمدة: {pages_str}"
        
    return cleaned

async def generate_tutor_answer(
    db: AsyncSession,
    document_id: int,
    question: str,
    target_page: Optional[int] = None,
    explanation_level: ExplanationLevel = ExplanationLevel.MEDIUM,
    history: Optional[List[Dict[str, str]]] = None
) -> TutorResponse:
    """
    RAG Tutor pipeline:
    1. Retrieves the most relevant Arabic chunks with page numbers.
    2. Builds a pedagogical prompt tuned to the student's chosen explanation level.
    3. Formats output as 100% clean plain text without markdown or backticks.
    4. Places references on the single final line only.
    """
    # 1. Retrieve top 5 most relevant passages (token-optimized)
    relevant_chunks = await search_relevant_chunks(
        db=db,
        document_id=document_id,
        query=question,
        top_k=5,
        target_page=target_page
    )
    
    # 2. Format context with source page labels
    context_blocks = []
    citations: List[SourceCitation] = []
    unique_pages = []
    
    for c in relevant_chunks:
        page = c["page_number"]
        chap = c["chapter"]
        # Limit text length to prevent rate limit overflow
        text = c["content"][:1000]
        if page not in unique_pages:
            unique_pages.append(page)
        context_blocks.append(f"--- [صفحة {page} | {chap}] ---\n{text}")
        
        citations.append(SourceCitation(
            page_number=page,
            chapter=chap,
            section_title=c.get("section_title"),
            excerpt=text[:160] + "..." if len(text) > 160 else text
        ))
        
    context_str = "\n\n".join(context_blocks)
    unique_pages.sort()
    pages_str = "، ".join([f"صفحة {p}" for p in unique_pages]) if unique_pages else ""
    
    level_instruction = LEVEL_PROMPTS.get(explanation_level, LEVEL_PROMPTS[ExplanationLevel.MEDIUM])
    
    system_prompt = (
        "أنت 'معلم StudyMind الذكي'، معلم خصوصي دقيق وأمين يساعد الطالب في فهم دروسه من واقع الكتاب المرفق فقط.\n"
        f"{level_instruction}\n\n"
        "قواعد الأمانة العلمية والدقة الصارمة:\n"
        "1. اعتمد في إجابتك بنسبة 100% على نصوص وصفحات الكتاب المرفقة أدناه حصراً.\n"
        "2. ممنوع نهائياً تأليف أو تخمين أو استنتاج معلومات غير واردة في المقتطفات.\n"
        "3. إذا سألك الطالب عن جزئية أو مصطلح غير مذكور في المقتطفات، وضح له بأمانة: 'هذه المعلومة غير مذكورة في هذه الصفحات من الكتاب'.\n"
        "4. التزم بأسماء المتغيرات والأوامر والمصطلحات والتعريفات كما هي مذكورة في المنهج حرفياً.\n\n"
        "قواعد التنسيق:\n"
        "1. اكتب الشرح كنص عادي تماماً (Plain Text) مريح للقراءة بدون أي وسوم ماركداون.\n"
        "2. ممنوع منعاً باتاً استخدام علامات الباك تيك (Backticks): لا تكتب علامات ``` ولا تكتب علامات ` حول الكلمات.\n"
        "3. إذا أردت كتابة أمر أو كلمة برمجية أو مفهوم، اكتبه كنص عادي بين علامتي تنصيص عادية مثل: \"قول\" أو \"python\".\n"
        "4. ممنوع جداول الماركداون (لا تستخدم رموز | أو ---)، بل استخدم نقاط وقوائم بسيطة وواضحة (مثل: • أو 1، 2، 3).\n"
        "5. ممنوع نهائياً وضع أرقام الصفحات أو المراجع بجانب كل جملة أو كل نقطة داخل النص.\n"
        "6. في نهاية إجابتك، اذكر المراجع في سطر واحد مستقل في النهاية فقط:\n"
        f"المصادر المعتمدة: {pages_str}\n"
        "7. بعد سطر المراجع، اختم دائماً بـ 3 أسئلة متابعة مقترحة للطالب تحت عنوان '💡 أسئلة مقترحة للمراجعة:'."
    )
    
    user_prompt = f"""
إليك المقتطفات ذات الصلة من كتاب/مذكرة الطالب:

{context_str}

سؤال الطالب:
"{question}"

الرجاء الإجابة على الطالب بدقة كاملة من واقع هذه النصوص فقط، وبنص عادي خالص دون جداول أو باك تيك.
"""

    raw_answer = await call_llm(
        prompt=user_prompt,
        system_instruction=system_prompt,
        temperature=0.1,
        max_tokens=1000
    )
    
    # Extract suggested followups if present
    suggested_followups: List[str] = []
    if "💡 أسئلة مقترحة للمراجعة:" in raw_answer:
        parts = raw_answer.split("💡 أسئلة مقترحة للمراجعة:")
        main_answer = parts[0].strip()
        followup_section = parts[1].strip()
        for line in followup_section.splitlines():
            clean_line = re.sub(r'^\s*[-*•\d\.]+\s*', '', line).strip()
            if clean_line:
                suggested_followups.append(clean_line)
    else:
        main_answer = raw_answer
        suggested_followups = [
            "هل يمكنك شرح مثال عملي أو مسألة على هذا الموضوع؟",
            "ما هي أهم الأسئلة المتوقعة في الامتحان على هذه الجزئية؟",
            "كيف أربط بين هذا الدرس والدروس السابقة؟"
        ]
        
    # Clean raw markdown and ensure single reference line at bottom
    formatted_answer = clean_body_text(main_answer, pages_str)
    
    return TutorResponse(
        answer=formatted_answer,
        explanation_level=explanation_level,
        sources=citations,
        suggested_followups=suggested_followups[:3]
    )

async def generate_document_summary(db: AsyncSession, document_id: int) -> Dict[str, Any]:
    """Generates a structured, clean-text pedagogical summary for a document."""
    from app.models.document import Document, DocumentChunk
    doc = await db.get(Document, document_id)
    if not doc:
        return {"error": "المستند غير موجود"}
        
    stmt = (
        select(DocumentChunk)
        .where(DocumentChunk.document_id == document_id)
        .order_by(DocumentChunk.page_number.asc())
        .limit(6)
    )
    result = await db.execute(stmt)
    chunks = result.scalars().all()
    
    context_text = "\n\n".join([f"[صفحة {c.page_number}]: {c.content[:600]}" for c in chunks])
    
    prompt = f"""
إليك مقتطفات من مادة/كتاب الطالب:
العنوان: {doc.title}
المادة: {doc.subject or 'عام'}

المحتوى المستخلص:
{context_text}

المطلوب:
اكتب ملخصاً تعليمياً شاملاً ومركزاً للمادة لمساعدة الطالب في المراجعة السريعة.
شروط التنسيق الإجبارية:
1. نص عادي مريح للقراءة بدون باك تيك (`) وبدون جداول (|).
2. قسّم الملخص بنقاط واضحة إلى:
• 📌 الفكرة العامة للمادة
• 🔑 أهم المفاهيم والقواعد الأساسية
• ⚠️ ملاحظات هامة للامتحان
• 🎯 خطوات مقترحة للمذاكرة
"""

    summary_raw = await call_llm(
        prompt=prompt,
        system_instruction="أنت معلم StudyMind الذكي، لخص المادة بأسلوب مشجع ومنظم بالنقاط دون وسوم ماركداون معقدة.",
        temperature=0.2,
        max_tokens=1200
    )
    
    pages = [c.page_number for c in chunks]
    pages_str = "، ".join([f"صفحة {p}" for p in sorted(list(set(pages)))]) if pages else ""
    formatted_summary = clean_body_text(summary_raw, pages_str)
    
    return {
        "document_id": document_id,
        "title": doc.title,
        "subject": doc.subject,
        "total_pages": doc.total_pages,
        "summary": formatted_summary
    }

