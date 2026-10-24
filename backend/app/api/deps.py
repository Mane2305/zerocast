from fastapi import Request

from app.config import Settings
from app.repository import Repository
from app.storage import Storage


def get_repository(request: Request) -> Repository:
    return request.app.state.repository


def get_storage(request: Request) -> Storage:
    return request.app.state.storage


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings
