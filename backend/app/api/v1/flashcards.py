import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.user import User
from app.models.flashcard import Flashcard
from app.api.deps import get_current_user
from app.core.rate_limiter import check_flashcard_rate_limit
from app.schemas.flashcard import (
    FlashcardCreate,
    FlashcardUpdate,
    FlashcardGenerateRequest,
    FlashcardReviewRequest,
    FlashcardResponse,
    FlashcardListResponse,
    FlashcardsDashboardMetrics,
    FlashcardReviewResponse
)
from app.services.flashcard_service import (
    generate_flashcards_from_document,
    record_card_review,
    get_dashboard_metrics,
    get_due_flashcards,
    list_flashcards,
    create_flashcard,
    update_flashcard,
    delete_flashcard,
    toggle_favorite,
    toggle_suspend,
    build_flashcard_response
)

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/generate", response_model=List[FlashcardResponse])
async def generate_cards(
    req: FlashcardGenerateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    _rate_limit: None = Depends(check_flashcard_rate_limit)
):
    """
    Generates flashcards strictly grounded in document text with zero hallucination.
    """
    try:
        cards = await generate_flashcards_from_document(db, current_user.id, req)
        return cards
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))
    except Exception as e:
        logger.error(f"Error generating flashcards: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="حدث خطأ أثناء توليد البطاقات التعليمية.")


@router.get("/dashboard", response_model=FlashcardsDashboardMetrics)
async def get_dashboard(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns high-level SM-2 retention metrics and due/new/mastered card counts.
    """
    return await get_dashboard_metrics(db, current_user.id)


@router.get("/due", response_model=List[FlashcardResponse])
async def get_due_cards(
    limit: int = Query(50, ge=1, le=100),
    document_id: Optional[int] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Returns cards scheduled for review now, prioritizing weak concepts first.
    """
    return await get_due_flashcards(db, current_user.id, limit=limit, document_id=document_id)


@router.get("", response_model=FlashcardListResponse)
async def get_cards(
    document_id: Optional[int] = Query(None),
    card_type: Optional[str] = Query(None),
    review_state: Optional[str] = Query(None),
    is_favorite: Optional[bool] = Query(None),
    is_suspended: Optional[bool] = Query(None),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Lists flashcards with search and filters.
    """
    return await list_flashcards(
        db,
        current_user.id,
        document_id=document_id,
        card_type=card_type,
        review_state=review_state,
        is_favorite=is_favorite,
        is_suspended=is_suspended,
        search=search,
        page=page,
        page_size=page_size
    )


@router.post("", response_model=FlashcardResponse, status_code=status.HTTP_201_CREATED)
async def create_card(
    data: FlashcardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Manually creates a new flashcard.
    """
    try:
        return await create_flashcard(db, current_user.id, data)
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(ve))


@router.get("/{card_id}", response_model=FlashcardResponse)
async def get_single_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieves a single card with ownership check.
    """
    stmt = select(Flashcard).options(selectinload(Flashcard.document)).where(Flashcard.id == card_id)
    res = await db.execute(stmt)
    card = res.scalars().first()
    if not card:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="البطاقة غير موجودة.")
    if card.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="لا تملك صلاحية الوصول لهذه البطاقة.")
    return build_flashcard_response(card)


@router.patch("/{card_id}", response_model=FlashcardResponse)
async def update_card(
    card_id: int,
    data: FlashcardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Updates card content or metadata.
    """
    try:
        return await update_flashcard(db, current_user.id, card_id, data)
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))


@router.delete("/{card_id}")
async def delete_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Deletes a flashcard.
    """
    try:
        return await delete_flashcard(db, current_user.id, card_id)
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))


@router.post("/{card_id}/review", response_model=FlashcardReviewResponse)
async def review_card(
    card_id: int,
    req: FlashcardReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Submits a review grade (Again/Hard/Good/Easy) and recalculates Spaced Repetition interval.
    """
    try:
        return await record_card_review(db, current_user.id, card_id, req)
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))


@router.post("/{card_id}/favorite", response_model=FlashcardResponse)
async def favorite_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Toggles favorite status.
    """
    try:
        return await toggle_favorite(db, current_user.id, card_id)
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))


@router.post("/{card_id}/suspend", response_model=FlashcardResponse)
async def suspend_card(
    card_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Toggles suspended status (exclude from reviews).
    """
    try:
        return await toggle_suspend(db, current_user.id, card_id)
    except PermissionError as pe:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(pe))
    except ValueError as ve:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(ve))
