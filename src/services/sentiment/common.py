import re
import time

import requests

from config import HEADERS
from ratelimit import limiter
from cache import TimedCache

_sentiment_cache = TimedCache()
SENTIMENT_TTL = 120
