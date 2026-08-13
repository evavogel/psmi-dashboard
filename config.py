"""Paths and build settings for the dashboard.

Source data lives in the paper folders and is never copied into this repo.
Adjust SOURCE_ROOT if the workspace moves.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE_ROOT = ROOT.parent.parent / "Papers"

PAPER1 = SOURCE_ROOT / "Paper1_Credibility"
CHAPTER = SOURCE_ROOT / "Chapter_PSMIs_Schill_Hendricks"

CODED = PAPER1 / "pipeline" / "results" / "gemini_full_coded.csv"
POSTS_META = PAPER1 / "data" / "newsinfluencer_data_filtered.csv"
TYPOLOGY = PAPER1 / "analysis" / "results" / "account_typology.csv"
VALIDATION = PAPER1 / "analysis" / "results" / "validation_overall.csv"
AFFILIATION = CHAPTER / "data" / "affiliation_coding.csv"

OUT_DIR = ROOT / "site" / "data"

# Analysis window. Collection ran 2024-09-01 to 2024-11-06; election day 2024-11-05.
WINDOW_START = "2024-09-01"
WINDOW_END = "2024-11-06"
ELECTION_DAY = "2024-11-05"

# Binary threshold applied to classifier outputs, matching the paper's analysis.
BINARY_THRESHOLD = 0.5

# Person-level alias map (same as the book chapter's chapter_analysis.py).
ALIASES = {
    "jackmposobiec": "jackposobiec",
    "officialbenshapiro": "benshapiro",
    "dineshjdsouza": "dineshdsouza",
    "scrowder": "stevencrowder",
    "louderwithcrowder": "stevencrowder",
    "libsoftiktokofficial": "libsoftiktok",
    "charliekirk11": "charliekirk",
    "charliekirk1776": "charliekirk",
    "marwilliamson": "mariannewilliamson",
}

# Origin-of-fame labels. Keys are the second-pass codes in affiliation_coding.csv.
ORIGIN_LABELS = {
    "political_influencer": "Native creator",
    "journalist": "Journalist",
    "entertainment": "Entertainment",
    "politician": "Politician",
}
ORIGIN_ORDER = ["political_influencer", "journalist", "entertainment", "politician"]

DIRECTION_COLS = [
    "pro_trump_republicans",
    "anti_trump_republicans",
    "pro_harris_democrats",
    "anti_harris_democrats",
]

# Campaign events annotated on the time series.
EVENTS = [
    ("2024-09-10", "Harris-Trump debate"),
    ("2024-09-15", "Second Trump assassination attempt"),
    ("2024-10-01", "Vance-Walz VP debate"),
    ("2024-10-27", "Madison Square Garden rally"),
    ("2024-11-05", "Election day"),
]

# Maximum example posts stored per account for the embed carousel.
EXAMPLES_PER_ACCOUNT = 6
