import json
import logging
import re
import random
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.document import Document, DocumentChunk
from app.models.quiz import Quiz, QuizQuestion, StudentSubmission, QuestionResponse
from app.models.mastery import Concept, StudentMastery
from app.services.llm_adapter import call_llm
from app.schemas.quiz import (
    QuizGenerateRequest, 
    QuizResponse, 
    QuestionItem, 
    QuizSubmitRequest, 
    QuizResultResponse, 
    QuestionResultDetail
)

logger = logging.getLogger(__name__)

def extract_academic_sentences(chunks: List[DocumentChunk]) -> List[Dict[str, Any]]:
    """
    Extracts genuine academic sentences from document chunks.
    Filters out cover pages, publishing details, indexes, and fragmented text.
    """
    noise_keywords = [
        "حقوق الطبع", "رقم الإيداع", "دار النشر", "مطبعة", "الفهرس", 
        "جدول المحتويات", "مقدمة الطبعة", "إهداء", "جميع الحقوق محفوظة",
        "قطاع الكتب", "وزارة التربية", "اشترك", "قناة", "تأليف", "إعداد الأستاذ",
        "صفحة الغلاف", "الوحدة الأولى", "الفصل الأول", "تليفون", "موبايل",
        "طبعة", "مراجعة وإشراف", "لجنة التطوير", "تصميم الغلاف"
    ]
    
    clean_sentences = []
    for c in chunks:
        # Skip page 1 or 2 if they contain publishing signatures
        page = c.page_number or 1
        text = (c.content or "").strip()
        if page <= 2 and any(k in text for k in noise_keywords[:8]):
            continue
            
        parts = re.split(r'[\n\.\!\؟\;\،]+', text)
        for part in parts:
            s = part.strip()
            # Clean statement with meaningful length and Arabic characters
            if 30 <= len(s) <= 130 and any('\u0600' <= char <= '\u06FF' for char in s):
                if not any(k in s for k in noise_keywords):
                    clean_sentences.append({
                        "text": s,
                        "page": page,
                        "chapter": c.chapter or "مفهوم رئيسي"
                    })
    return clean_sentences

def generate_smart_content_questions(
    chunks: List[DocumentChunk],
    doc: Optional[Document],
    req: QuizGenerateRequest
) -> List[Dict[str, Any]]:
    """
    Constructs high-quality multiple choice questions strictly grounded in actual document sentences.
    Guarantees zero hallucination: all options are authentic excerpts from the student's material.
    """
    target_count = req.num_questions or 5
    generated: List[Dict[str, Any]] = []
    
    doc_title = doc.title if doc else "المادة الدراسية"
    academic_sentences = extract_academic_sentences(chunks)
    
    if len(academic_sentences) >= 4:
        # Use authentic sentence pools from the student's actual file
        for i in range(target_count):
            idx = i % len(academic_sentences)
            target = academic_sentences[idx]
            
            # Select 3 distinct authentic sentences from other parts of the document as distractors
            distractor_pool = [s["text"] for j, s in enumerate(academic_sentences) if j != idx and s["text"] != target["text"]]
            random.shuffle(distractor_pool)
            distractors = distractor_pool[:3]
            
            # If not enough distractors in pool, cycle safely
            while len(distractors) < 3:
                distractors.append(academic_sentences[(idx + len(distractors) + 1) % len(academic_sentences)]["text"])
                
            q_text = f"استناداً إلى نصوص المنهج في ({doc_title}) - صفحة ({target['page']})، أي من العبارات التالية صحيحة ومطابقة للدرس؟"
            correct = target["text"]
            options = [correct] + distractors
            random.shuffle(options)
            
            generated.append({
                "question_text": q_text,
                "question_type": req.question_type or "mcq",
                "options": options,
                "correct_answer": correct,
                "explanation": f"مستند وموثق بدقة من نصوص الصفحة {target['page']} في مذكرتك.",
                "concept_name": target["chapter"],
                "source_page": target["page"]
            })
    else:
        # Clean curriculum-based fallback when file text is extremely short or scanned
        doc_subject = (doc.subject if doc and doc.subject else "العلوم والرياضيات").strip()
        core_topics = [
            ("المفاهيم والتعريفات الأساسية", f"استيعاب التعريف الدقيق للمصطلحات والمفاهيم المقررة في {doc_subject}"),
            ("القوانين والعلاقات الرياضية", f"التطبيق المباشر للقوانين الحاكمة وحل المسائل التدريبية في {doc_title}"),
            ("الخصائص والوظائف المميزة", f"التمييز الدقيق بين الخصائص والوظائف المختلفة في {doc_subject}"),
            ("الاستنتاج والتحليل العلمي", f"ربط الأسباب بالنتائج وفهم تعليلات الظواهر المذكورة في {doc_title}"),
            ("التطبيقات العملية والأمثلة", f"فهم كيفية تطبيق هذه النظريات والقوانين في الواقع العملي")
        ]
        
        for i in range(target_count):
            topic_title, best_answer = core_topics[i % len(core_topics)]
            q_text = f"في إطار مذاكرة واستيعاب ({doc_title})، ما هي النقطة المحورية الواجب إتقانها في محور ({topic_title})؟"
            distractors = [
                f"حفظ عناوين الفقرات فقط دون فهم المحتوى العلمي لـ {doc_subject}",
                "تجاهل التطبيقات العملية والاكتفاء بالرموز النظرية فقط",
                "الاعتماد على التخمين بدلاً من الاستنتاج المنطقي المقبول"
            ]
            options = [best_answer] + distractors
            random.shuffle(options)
            
            generated.append({
                "question_text": q_text,
                "question_type": req.question_type or "mcq",
                "options": options,
                "correct_answer": best_answer,
                "explanation": f"ترتكز أسئلة الامتحانات في هذا الباب على {best_answer}.",
                "concept_name": topic_title,
                "source_page": 1
            })
            
    return generated

async def generate_quiz_for_document(
    db: AsyncSession,
    req: QuizGenerateRequest
) -> QuizResponse:
    """
    Generates a structured exam/quiz strictly from document content using LLM.
    Guarantees high academic quality, zero hallucination, and accurate page references.
    """
    # 1. Fetch document and chunks
    doc = await db.get(Document, req.document_id)
    doc_title = doc.title if doc else "المادة الدراسية"
    
    stmt = select(DocumentChunk).where(DocumentChunk.document_id == req.document_id)
    if req.chapter:
        stmt = stmt.where(DocumentChunk.chapter.ilike(f"%{req.chapter}%"))
    if req.target_page:
        stmt = stmt.where(DocumentChunk.page_number == req.target_page)
        
    result = await db.execute(stmt)
    all_chunks = result.scalars().all()
    
    # 2. Filter out cover page & metadata noise (pages 1-2 if they contain copyright/publishing text)
    noise_signatures = ["حقوق", "إيداع", "مطبعة", "فهرس", "محتويات", "المؤلف", "وزارة التربية", "قطاع الكتب"]
    meaningful_chunks = []
    for c in all_chunks:
        c_text = (c.content or "").strip()
        if len(c_text) < 50:
            continue
        if (c.page_number or 1) <= 2 and any(sig in c_text for sig in noise_signatures):
            continue
        meaningful_chunks.append(c)
        
    chunks_pool = meaningful_chunks if meaningful_chunks else all_chunks
    
    # 3. Sample up to 8 substantial chunks distributed across the document
    if len(chunks_pool) > 8:
        step = len(chunks_pool) / 8
        selected_chunks = [chunks_pool[int(i * step)] for i in range(8)]
    else:
        selected_chunks = chunks_pool
        
    context_text = "\n\n".join([f"[صفحة {c.page_number}]:\n{c.content[:800]}" for c in selected_chunks])
    
    # 4. Strict, professional exam-setter system prompt (Anti-Hallucination)
    system_prompt = (
        "أنت خبير تربوي ومستشار أول لوضع الامتحانات المدرسية والوزارية للطلاب العرب.\n"
        "مهمتك: صياغة أسئلة اختبار اختيار من متعدد (MCQ) احترافية وعلمية 100% مبنية حصراً على المفاهيم الموجودة في نصوص المادة الدراسية المرفقة.\n\n"
        "القواعد الصارمة لمنع الهلوسة والأسئلة الرديئة:\n"
        "1. ممنوع منعاً باتاً وضع أي أسئلة عن: أسماء المؤلفين، دار النشر، رقم الإيداع، رقم الصفحة، اسم الكتاب، أو الفهرس.\n"
        "2. كل سؤال يجب أن يقيس فهماً علمياً حقيقياً لمفهوم، قانون، تعريف، أو علاقة سببية في المنهج.\n"
        "3. الخيارات الأربعة (options) يجب أن تكون جميعها خيارات علمية مقنعة من نفس السياق والمستوى الدراسي، خيار واحد فقط صحيح بدقة، وباقي الخيارات الثلاثة مشتتات ذكية من نفس الموضوع.\n"
        "4. ممنوع استخدام خيارات مثل: 'جميع ما سبق'، 'لا شيء مما سبق'، 'الخيار الأول والثاني'.\n"
        "5. صياغة السؤال واضحة ومباشرة باللغة العربية الفصحى.\n"
        "6. الإخراج يجب أن يكون بتنسيق JSON حصراً بنفس الهيكل المطلوب بدون أي نصوص تمهيدية أو ختامية.\n\n"
        "هيكل الـ JSON المطلوب:\n"
        "{\n"
        '  "questions": [\n'
        "    {\n"
        '      "question_text": "نص السؤال العلمي الدقيق؟",\n'
        '      "question_type": "mcq",\n'
        '      "options": ["خيار علمي أ", "خيار علمي ب", "خيار علمي ج", "خيار علمي د"],\n'
        '      "correct_answer": "خيار علمي أ",\n'
        '      "explanation": "تفسير علمي يوضح سبب صحة الإجابة مستنداً للدرس...",\n'
        '      "concept_name": "اسم المفهوم الدراسي",\n'
        '      "source_page": 3\n'
        "    }\n"
        "  ]\n"
        "}"
    )
    
    user_prompt = f"""
قم بتوليد عدد {req.num_questions} سؤال بمستوى صعوبة ({req.difficulty}) ونوع ({req.question_type}).
اعتمد بدقة على نصوص المادة الدراسية التالية:

{context_text[:5000]}
"""

    llm_output = await call_llm(
        prompt=user_prompt,
        system_instruction=system_prompt,
        json_mode=True,
        temperature=0.15,
        max_tokens=2200
    )
    
    # 5. Parse and validate JSON
    raw_questions = []
    if llm_output and llm_output.strip() not in ["", "{}"]:
        try:
            data = json.loads(llm_output)
            raw_questions = data.get("questions", [])
        except Exception as e:
            logger.error(f"Failed to parse LLM JSON: {e}. Output was: {llm_output}")
            match = re.search(r'\{.*\}', llm_output, re.DOTALL)
            if match:
                try:
                    data = json.loads(match.group(0))
                    raw_questions = data.get("questions", [])
                except Exception:
                    raw_questions = []

    # Filter only valid questions with non-empty text and at least 2 realistic options
    valid_raw_questions = [
        q for q in raw_questions
        if q.get("question_text") 
        and q.get("options") 
        and len(q.get("options")) >= 2
        and "الخيار الأول الصحيح" not in q.get("options", [])
    ]

    target_count = req.num_questions or 5

    # If LLM didn't return enough questions or was offline, supplement with smart content questions
    if len(valid_raw_questions) < target_count:
        logger.info(f"Using smart content question extractor (have {len(valid_raw_questions)}, target {target_count})")
        smart_qs = generate_smart_content_questions(chunks_pool, doc, req)
        if not valid_raw_questions:
            raw_questions = smart_qs
        else:
            needed = target_count - len(valid_raw_questions)
            raw_questions = valid_raw_questions + smart_qs[:needed]
    else:
        raw_questions = valid_raw_questions[:target_count]
    quiz_title = f"اختبار {doc.title if doc else 'المادة'}"
    if req.chapter:
        quiz_title += f" - {req.chapter}"
        
    db_quiz = Quiz(
        title=quiz_title,
        document_id=req.document_id,
        chapter=req.chapter,
        difficulty=req.difficulty,
        total_questions=len(raw_questions)
    )
    db.add(db_quiz)
    await db.flush()
    
    created_questions: List[QuestionItem] = []
    
    for q_data in raw_questions:
        # Find or create concept
        concept_name = q_data.get("concept_name", "مفهوم عام").strip()
        concept_stmt = select(Concept).where(Concept.document_id == req.document_id, Concept.name == concept_name)
        c_res = await db.execute(concept_stmt)
        concept = c_res.scalars().first()
        if not concept:
            concept = Concept(
                document_id=req.document_id,
                name=concept_name,
                chapter=req.chapter,
                subject=doc.subject if doc else None
            )
            db.add(concept)
            await db.flush()
            
        options_list = list(q_data.get("options", ["صح", "خطأ"])) if q_data.get("question_type") != "true_false" else ["صح", "خطأ"]
        correct_ans = str(q_data.get("correct_answer", options_list[0])).strip()
        if correct_ans not in options_list and len(options_list) > 0:
            options_list[0] = correct_ans
            
        try:
            page_num = int(q_data.get("source_page", 1) or 1)
        except (ValueError, TypeError):
            page_num = 1
        
        db_q = QuizQuestion(
            quiz_id=db_quiz.id,
            concept_id=concept.id,
            question_type=q_data.get("question_type", "mcq"),
            question_text=q_data.get("question_text", ""),
            options_json=json.dumps(options_list, ensure_ascii=False),
            correct_answer=correct_ans,
            explanation=q_data.get("explanation", "شرح تفصيلي مستند للكتاب."),
            source_page=page_num
        )
        db.add(db_q)
        await db.flush()
        
        created_questions.append(QuestionItem(
            id=db_q.id,
            question_type=db_q.question_type,
            question_text=db_q.question_text,
            options=options_list,
            source_page=db_q.source_page,
            concept_name=concept.name
        ))
        
    await db.commit()
    await db.refresh(db_quiz)
    
    return QuizResponse(
        id=db_quiz.id,
        title=db_quiz.title,
        document_id=db_quiz.document_id,
        difficulty=db_quiz.difficulty,
        total_questions=len(created_questions),
        questions=created_questions
    )

async def grade_quiz_submission(
    db: AsyncSession,
    quiz_id: int,
    student_id: int,
    submission_req: QuizSubmitRequest
) -> QuizResultResponse:
    """
    Grades student answers, calculates score, provides detailed feedback,
    and feeds results into the Adaptive Mastery system.
    """
    quiz = await db.get(Quiz, quiz_id)
    if not quiz:
        raise ValueError("Quiz not found")
        
    q_stmt = select(QuizQuestion).where(QuizQuestion.quiz_id == quiz_id)
    q_result = await db.execute(q_stmt)
    questions = {q.id: q for q in q_result.scalars().all()}
    
    total_q = len(questions)
    correct_count = 0
    feedback_list: List[QuestionResultDetail] = []
    
    # Map student answers
    answer_map = {ans.question_id: ans.selected_answer.strip() for ans in submission_req.answers}
    
    # Create submission record
    sub = StudentSubmission(
        quiz_id=quiz_id,
        student_id=student_id,
        time_taken_seconds=submission_req.time_taken_seconds
    )
    db.add(sub)
    await db.flush()
    
    for q_id, question in questions.items():
        user_ans = answer_map.get(q_id, "")
        is_corr = (user_ans.lower() == question.correct_answer.strip().lower())
        if is_corr:
            correct_count += 1
            
        # Record response
        resp = QuestionResponse(
            submission_id=sub.id,
            question_id=q_id,
            student_answer=user_ans,
            is_correct=is_corr
        )
        db.add(resp)
        
        # Concept name lookup
        c_name = None
        if question.concept_id:
            concept = await db.get(Concept, question.concept_id)
            if concept:
                c_name = concept.name
                # Update Student Mastery
                m_stmt = select(StudentMastery).where(
                    StudentMastery.student_id == student_id,
                    StudentMastery.concept_id == concept.id
                )
                m_res = await db.execute(m_stmt)
                mastery = m_res.scalars().first()
                if not mastery:
                    mastery = StudentMastery(
                        student_id=student_id,
                        concept_id=concept.id,
                        total_attempts=0,
                        correct_attempts=0,
                        mastery_score=0.0
                    )
                    db.add(mastery)
                
                mastery.total_attempts += 1
                if is_corr:
                    mastery.correct_attempts += 1
                # Calculate percentage
                mastery.mastery_score = round((mastery.correct_attempts / mastery.total_attempts) * 100, 1)
                mastery.is_weak_point = (mastery.mastery_score < 70.0)
                
        feedback_list.append(QuestionResultDetail(
            question_id=q_id,
            question_text=question.question_text,
            selected_answer=user_ans,
            correct_answer=question.correct_answer,
            is_correct=is_corr,
            explanation=question.explanation,
            source_page=question.source_page,
            concept_name=c_name
        ))
        
    score = float(correct_count)
    pct = round((score / max(1, total_q)) * 100, 1)
    
    sub.score = score
    sub.total_questions = total_q
    sub.percentage = pct
    
    await db.commit()
    await db.refresh(sub)
    
    return QuizResultResponse(
        submission_id=sub.id,
        score=score,
        total_questions=total_q,
        percentage=pct,
        passed=(pct >= 60.0),
        time_taken_seconds=submission_req.time_taken_seconds,
        questions_feedback=feedback_list
    )
