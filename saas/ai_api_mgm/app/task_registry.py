from __future__ import annotations
import asyncio
import time
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Literal

State = Literal["running", "cancelling", "cancelled", "completed", "failed"]


@dataclass
class TaskEntry:
    task_id: str
    user_id: Optional[str] = None
    started_at: float = field(default_factory=lambda: time.time())
    updated_at: float = field(default_factory=lambda: time.time())
    state: State = "running"
    task: Optional[asyncio.Task] = None
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None

    def touch(self) -> None:
        self.updated_at = time.time()


class TaskRegistry:
    def __init__(self) -> None:
        self._tasks: Dict[str, TaskEntry] = {}
        self._lock = asyncio.Lock()

    async def register(self, entry: TaskEntry) -> None:
        async with self._lock:
            self._tasks[entry.task_id] = entry

    async def get(self, task_id: str) -> Optional[TaskEntry]:
        async with self._lock:
            return self._tasks.get(task_id)

    async def set_state(
        self, task_id: str, state: State, *, result=None, error=None
    ) -> None:
        async with self._lock:
            te = self._tasks.get(task_id)
            if not te:
                return
            te.state = state
            te.result = result
            te.error = error
            te.touch()

    async def cancel(self, task_id: str) -> bool:
        async with self._lock:
            te = self._tasks.get(task_id)
            if not te or not te.task:
                return False
            if te.state in ("cancelled", "completed", "failed"):
                return True
            te.state = "cancelling"
            te.touch()
            te.task.cancel()
            return True

    async def has_active_cancellation(self, user_id: Optional[str]) -> bool:
        async with self._lock:
            for te in self._tasks.values():
                if te.user_id == user_id and te.state in ("running", "cancelling"):
                    return True
            return False


registry = TaskRegistry()
