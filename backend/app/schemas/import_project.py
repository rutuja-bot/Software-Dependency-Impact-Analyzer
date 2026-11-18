from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

class GitHubImportRequest(BaseModel):
    repo_url: str = Field(..., description="Official GitHub repository URL, e.g. https://github.com/owner/repo")
    branch: Optional[str] = Field(None, description="Optional branch or tag name; defaults to repository default branch")
    auth_token: Optional[str] = Field(None, description="Optional GitHub Personal Access Token for private repositories")
    persist: bool = Field(True, description="Whether to persist the imported project in PostgreSQL database if available")

class GitHubRepoInfoRequest(BaseModel):
    repo_url: str = Field(..., description="Official GitHub repository URL")
    auth_token: Optional[str] = Field(None, description="Optional GitHub Personal Access Token for private repositories")

class GitHubRepoInfoResponse(BaseModel):
    owner: str
    repo: str
    full_name: str
    default_branch: str
    is_private: bool
    description: Optional[str] = None
    has_package_json: bool
    has_lockfile: bool
    latest_commit_sha: Optional[str] = None

class ArchiveUploadMetadata(BaseModel):
    filename: str
    files_count: int
    compressed_bytes: int
    uncompressed_bytes: int
    manifest_path: str
    has_lockfile: bool
