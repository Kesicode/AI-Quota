from __future__ import annotations

import logging
import re
import sys

_SENSITIVE_PATTERNS = [
    re.compile(r'(?i)(bearer\s+)[a-zA-Z0-9_\-\.]{10,}'),
    re.compile(r'(?i)(password|secret|token|api[_-]?key|cookie)["\']?\s*[:=]\s*["\']?([^"\'\s]+)'),
]


def sanitize_text(text: str) -> str:
    """Strip passwords, API keys, tokens, and cookies from log strings."""
    if not text:
        return ""
    sanitized = text
    for pattern in _SENSITIVE_PATTERNS:
        sanitized = pattern.sub(r'\1***REDACTED***', sanitized)
    return sanitized


class SanitizingFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        orig = super().format(record)
        return sanitize_text(orig)


def get_logger(name: str = "ai_quota") -> logging.Logger:
    logger = logging.getLogger(name)
    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(
            SanitizingFormatter("[%(asctime)s] [%(levelname)s] [%(name)s]: %(message)s", datefmt="%Y-%m-%d %H:%M:%S")
        )
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
    return logger
