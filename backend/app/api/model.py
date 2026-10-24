from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import get_engine
from app.engine import YugEngine
from app.schemas import Error, ModelInfo

router = APIRouter(tags=["model"])


@router.get(
    "/model/info",
    response_model=ModelInfo,
    response_model_exclude_none=True,
    responses={503: {"model": Error}},
)
def model_info(engine: Annotated[YugEngine, Depends(get_engine)]) -> dict:
    return engine.info()
