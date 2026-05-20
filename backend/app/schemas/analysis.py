from typing import Any

from pydantic import BaseModel, Field


class FilterSpec(BaseModel):
    column: str
    values: list[str] = Field(default_factory=list)


class DateRangeSpec(BaseModel):
    start: str | None = None
    end: str | None = None


class DynamicAnalysisRequest(BaseModel):
    dimensions: list[str] = Field(default_factory=list)
    metric: str = "count"
    filters: list[FilterSpec] = Field(default_factory=list)
    date_range: DateRangeSpec | None = None


class DynamicAnalysisResponse(BaseModel):
    rows: list[dict[str, Any]]
