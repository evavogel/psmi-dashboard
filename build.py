"""Build the dashboard's JSON data files from the Paper 1 and book-chapter sources.

    python build.py

Reads the classified post file, the post metadata file, the account typology and
the chapter's affiliation coding; writes site/data/*.json.

The output carries only what the dashboard renders. No post text, no raw source
data, and no measure the site does not display. Example posts are referenced by
public URL and rendered client-side through the platforms' own embed widgets, so
the dashboard never republishes platform content.
"""

import json
import re
from collections import Counter

import numpy as np
import pandas as pd

import config as C


def person_key(username):
    k = re.sub(r"[^a-z0-9]", "", str(username).lower())
    return C.ALIASES.get(k, k)


def binarize(series):
    return (pd.to_numeric(series, errors="coerce").fillna(0) >= C.BINARY_THRESHOLD).astype(int)


def recover_timestamps(meta):
    """X rows carry no created_at; recover it from the snowflake id in post_url."""
    ts = pd.to_datetime(meta["created_at"], errors="coerce", format="mixed")
    is_x = meta["platform"].eq("x")
    snowflake = meta.loc[is_x, "post_url"].str.extract(r"/status/(\d+)")[0]
    ok = snowflake.notna()
    ids = snowflake[ok].astype("int64").to_numpy()
    recovered = pd.to_datetime(np.right_shift(ids, 22) + 1288834974657, unit="ms")
    ts.loc[snowflake[ok].index] = recovered
    return ts


def bootstrap_ci(values, n_boot=2000, seed=7):
    values = np.asarray(values, dtype=float)
    values = values[~np.isnan(values)]
    if len(values) < 2:
        return (float("nan"), float("nan"))
    rng = np.random.default_rng(seed)
    means = rng.choice(values, size=(n_boot, len(values)), replace=True).mean(axis=1)
    lo, hi = np.percentile(means, [2.5, 97.5])
    return (round(float(lo), 3), round(float(hi), 3))


def group_stats(frame, value, by, order=None):
    rows = []
    for key, sub in frame.groupby(by):
        vals = sub[value].dropna().values
        lo, hi = bootstrap_ci(vals)
        rows.append({
            "key": key,
            "n": int(len(vals)),
            "mean": round(float(np.mean(vals)), 4) if len(vals) else None,
            "lo": lo, "hi": hi,
        })
    if order:
        index = {r["key"]: r for r in rows}
        rows = [index[k] for k in order if k in index]
    return rows


def load():
    coded = pd.read_csv(C.CODED, low_memory=False)
    meta = pd.read_csv(C.POSTS_META, low_memory=False)

    keep_meta = ["id", "created_at", "post_url", "likes_count", "comments_count",
                 "view_count", "shares_count", "media_type", "platform"]
    # The metadata file carries a handful of duplicated ids; keep the first row.
    meta = meta[keep_meta].drop_duplicates("id").copy()
    meta["timestamp"] = recover_timestamps(meta)

    # The coded file's post_url is near-empty and its platform column is null for
    # 4,554 rows; both are complete in the metadata file, which agrees with the
    # coded values wherever both are present. Drop the coded copies so the merge
    # keeps the metadata versions.
    coded = coded.drop(columns=[c for c in ("post_url", "post_text", "platform")
                                if c in coded.columns])

    posts = coded.merge(meta, on="id", how="inner")

    for col in ["political"] + C.DIRECTION_COLS:
        posts[col] = binarize(posts[col])

    posts["date"] = posts["timestamp"].dt.normalize()
    in_window = posts["date"].between(pd.Timestamp(C.WINDOW_START),
                                      pd.Timestamp(C.WINDOW_END) + pd.Timedelta(days=1))
    posts["in_window"] = in_window.fillna(False)

    posts["attack"] = posts[["anti_trump_republicans", "anti_harris_democrats"]].max(axis=1)
    posts["advocacy"] = posts[["pro_trump_republicans", "pro_harris_democrats"]].max(axis=1)
    posts["partisan"] = posts[C.DIRECTION_COLS].max(axis=1)
    posts["account_id"] = posts["username"] + "@" + posts["platform"]
    posts["person"] = posts["username"].map(person_key)
    posts["likes"] = pd.to_numeric(posts["likes_count"], errors="coerce")

    typology = pd.read_csv(C.TYPOLOGY)
    affiliation = pd.read_csv(C.AFFILIATION)
    validation = pd.read_csv(C.VALIDATION)

    return posts, typology, affiliation, validation


def build_accounts(posts, typology, affiliation):
    acc = typology.copy()

    aff = affiliation[["username", "platform", "person", "creator_type"]].copy()
    aff = aff.rename(columns={"creator_type": "origin"})
    acc = acc.merge(aff, on=["username", "platform"], how="left")
    acc["person"] = acc["person"].fillna(acc["username"].map(person_key))
    acc["origin"] = acc["origin"].fillna(acc["creator_type"])

    # Post-derived per-account measures.
    grouped = posts.groupby("account_id")
    partisan_posts = posts[posts["partisan"] == 1]
    pgrp = partisan_posts.groupby("account_id")

    derived = pd.DataFrame({
        "n_partisan": pgrp.size(),
        "attack_rate": pgrp["attack"].mean(),
        "advocacy_rate": pgrp["advocacy"].mean(),
        "median_likes": grouped["likes"].median(),
    })
    pol = posts[posts["political"] == 1].groupby("account_id")["likes"].median()
    nonpol = posts[posts["political"] == 0].groupby("account_id")["likes"].median()
    derived["median_likes_political"] = pol
    derived["median_likes_nonpolitical"] = nonpol

    acc = acc.merge(derived, left_on="account_id", right_index=True, how="left")

    days = pd.date_range(C.WINDOW_START, C.WINDOW_END, freq="D")
    examples = build_examples(posts)

    # Only fields the site renders. Anything else is recomputed by re-running this
    # script, so nothing published carries measures the dashboard does not show.
    records = []
    for _, r in acc.iterrows():
        aid = r["account_id"]
        records.append({
            "id": aid,
            "username": r["username"],
            "platform": r["platform"],
            "origin": r["origin"],
            "party": r["party_manual"],
            "n_posts": int(r["n_posts"]),
            "political_share": round(float(r["political_share"]), 4),
            "p_signed": round(float(r["p_signed"]), 4),
            "p_abs": round(float(r["p_abs"]), 4),
            "type": r["rothut_type"],
            "n_partisan": int(r["n_partisan"]) if pd.notna(r["n_partisan"]) else 0,
            "attack_rate": none_or_round(r["attack_rate"]),
            "advocacy_rate": none_or_round(r["advocacy_rate"]),
            "median_likes": none_or_int(r["median_likes"]),
            "examples": examples.get(aid, []),
        })
    records.sort(key=lambda x: -x["n_posts"])
    # acc keeps the extra columns for the aggregates below; only records are published.
    return records, [d.strftime("%Y-%m-%d") for d in days], acc


def none_or_round(v, digits=4):
    return round(float(v), digits) if pd.notna(v) else None


def none_or_int(v):
    return int(v) if pd.notna(v) else None


def build_examples(posts):
    """Pick embeddable example posts per account, chosen to illustrate the tone
    measures the dashboard shows: an attack post, an advocacy post, the biggest
    political post and a non-political one. URLs and labels only, never post text."""
    out = {}
    usable = posts[posts["post_url"].notna() & posts["in_window"]].copy()
    for aid, sub in usable.groupby("account_id"):
        picks, seen = [], set()

        def take(frame):
            if frame.empty or len(picks) >= C.EXAMPLES_PER_ACCOUNT:
                return
            row = frame.nlargest(1, "likes").iloc[0]
            if row["id"] in seen:
                return
            seen.add(row["id"])
            picks.append({
                "url": row["post_url"],
                "platform": row["platform"],
                "date": row["date"].strftime("%Y-%m-%d") if pd.notna(row["date"]) else None,
                "likes": none_or_int(row["likes"]),
                "political": int(row["political"]),
                "direction": direction_of(row),
                "tone": ("attack" if row["attack"] and not row["advocacy"]
                         else "advocacy" if row["advocacy"] and not row["attack"]
                         else "both" if row["advocacy"] and row["attack"] else None),
            })

        # Pure attack and pure advocacy first, so both tones are represented before
        # the highest-engagement post crowds the list.
        take(sub[(sub["attack"] == 1) & (sub["advocacy"] == 0)])
        take(sub[(sub["advocacy"] == 1) & (sub["attack"] == 0)])
        take(sub[(sub["advocacy"] == 1) & (sub["attack"] == 1)])
        take(sub[sub["political"] == 1])
        take(sub[sub["political"] == 0])
        out[aid] = picks
    return out


def direction_of(row):
    if row["pro_trump_republicans"] or row["anti_harris_democrats"]:
        right = True
    else:
        right = False
    if row["pro_harris_democrats"] or row["anti_trump_republicans"]:
        left = True
    else:
        left = False
    if right and not left:
        return "republican"
    if left and not right:
        return "democrat"
    if right and left:
        return "mixed"
    return "none"


def build_overview(posts, acc, days):
    """Group-level aggregates. Emits only the blocks the site renders."""
    windowed = posts[posts["in_window"]]
    parties = ["Republican", "Democrat", "Neutral"]
    platforms = ["x", "instagram", "tiktok"]
    migrated = ["journalist", "entertainment", "politician"]

    origin_accounts = Counter(acc["origin"].dropna())
    migrated_accounts = acc["origin"].isin(migrated).mean()

    # One-sidedness zones follow the chapter: |p| < 1/3 mixed, 1/3-2/3 leaning, > 2/3 one-sided.
    measured = acc[acc["n_partisan"] >= 1]
    one_sided = int((measured["p_abs"] > 2 / 3).sum())
    leaning = int(((measured["p_abs"] >= 1 / 3) & (measured["p_abs"] <= 2 / 3)).sum())
    mixed = int((measured["p_abs"] < 1 / 3).sum())

    def daily_by(col, keys):
        out = {}
        for key in keys:
            ids = set(acc.loc[acc[col] == key, "account_id"])
            counts = (windowed[windowed["account_id"].isin(ids)].groupby("date").size()
                      .reindex(pd.date_range(C.WINDOW_START, C.WINDOW_END, freq="D"), fill_value=0))
            out[key] = counts.astype(int).tolist()
        return out

    eng = [{
        "key": key,
        "political": int(acc.loc[acc["party_manual"] == key, "median_likes_political"].median()),
        "nonpolitical": int(acc.loc[acc["party_manual"] == key,
                                    "median_likes_nonpolitical"].dropna().median()),
    } for key in ["Republican", "Democrat"]]

    return {
        "window": {"start": C.WINDOW_START, "end": C.WINDOW_END,
                   "election_day": C.ELECTION_DAY, "days": days},
        "events": [{"date": d, "label": l} for d, l in C.EVENTS],
        "totals": {
            "accounts": int(len(acc)),
            "persons": int(acc["person"].nunique()),
            "posts": int(len(posts)),
            "posts_in_window": int(len(windowed)),
            "political_share": round(float(posts["political"].mean()), 4),
            "platforms": {p: int((acc["platform"] == p).sum()) for p in platforms},
            "posts_by_platform": {p: int((posts["platform"] == p).sum()) for p in platforms},
            "parties": {p: int((acc["party_manual"] == p).sum()) for p in parties},
        },
        "origin": {
            "labels": C.ORIGIN_LABELS,
            "order": C.ORIGIN_ORDER,
            "accounts": {k: int(origin_accounts.get(k, 0)) for k in C.ORIGIN_ORDER},
            "migrated_accounts": round(float(migrated_accounts), 4),
            "p_abs": group_stats(measured, "p_abs", "origin", C.ORIGIN_ORDER),
            "platform_mix": {
                k: {p: int(((acc["origin"] == k) & (acc["platform"] == p)).sum())
                    for p in platforms}
                for k in C.ORIGIN_ORDER
            },
        },
        "onesidedness": {"one_sided": one_sided, "leaning": leaning, "mixed": mixed,
                         "n": int(len(measured))},
        "engagement": eng,
        "timeseries": {
            "by_party": daily_by("party_manual", ["Republican", "Democrat"]),
            "by_origin": daily_by("origin", C.ORIGIN_ORDER),
            "political_share": (windowed.groupby("date")["political"].mean()
                                .reindex(pd.date_range(C.WINDOW_START, C.WINDOW_END, freq="D"))
                                .round(4).fillna(0).tolist()),
        },
    }


def build_quiz(posts, acc, overview):
    """Perception items: the visitor estimates a population quantity, then sees the
    measured value."""
    partisan = posts[posts["partisan"] == 1]

    both_sides = overview["onesidedness"]["mixed"] / overview["onesidedness"]["n"]
    attack_share = float(partisan["attack"].mean())
    attack_only = float(((partisan["attack"] == 1) & (partisan["advocacy"] == 0)).mean())
    advocacy_only = float(((partisan["advocacy"] == 1) & (partisan["attack"] == 0)).mean())
    both_tones = float(((partisan["attack"] == 1) & (partisan["advocacy"] == 1)).mean())
    pol = acc["median_likes_political"].median()
    nonpol = acc["median_likes_nonpolitical"].dropna().median()
    likes_ratio = float(pol / nonpol) if nonpol else None

    items = [
        {
            "key": "political_share",
            "question": "Of everything these 140 accounts posted during the campaign, what share was "
                        "about politics?",
            "unit": "percent", "min": 0, "max": 100,
            "answer": round(float(overview["totals"]["political_share"]) * 100, 1),
            "reveal": "Politics was not an occasional topic for these accounts. It was most of the feed.",
        },
        {
            "key": "both_sides",
            "question": "What share of these accounts posted content supporting both sides, rather "
                        "than only one?",
            "unit": "percent", "min": 0, "max": 100,
            "answer": round(both_sides * 100, 1),
            "reveal": f"Only {overview['onesidedness']['mixed']} of "
                      f"{overview['onesidedness']['n']} accounts with a measurable lean sit near the "
                      f"middle. The rest post one side almost exclusively.",
        },
        {
            "key": "migrated",
            "question": "What share of these creators were already famous before politics, arriving "
                        "from news, entertainment or elected office?",
            "unit": "percent", "min": 0, "max": 100,
            "answer": round(float(overview["origin"]["migrated_accounts"]) * 100, 1),
            "reveal": "Nearly half did not build their audience on politics. They brought one with them.",
        },
        {
            "key": "attack",
            "question": "When these accounts posted about the election, what share of those posts "
                        "attacked an opponent rather than only supporting their own side?",
            "unit": "percent", "min": 0, "max": 100,
            "answer": round(attack_share * 100, 1),
            "reveal": f"Attacking is the more common move: {attack_only * 100:.0f}% of partisan posts "
                      f"only attack, {advocacy_only * 100:.0f}% only advocate, and "
                      f"{both_tones * 100:.0f}% do both.",
        },
    ]
    if likes_ratio:
        items.append({
            "key": "likes_ratio",
            "question": "How many times more likes did a political post get than a non-political one "
                        "from the same accounts?",
            "unit": "times", "min": 0, "max": 10,
            "answer": round(likes_ratio, 1),
            "reveal": "Politics did not cost these accounts their audience. It paid.",
        })

    return {"perception": items}


def build_methods(validation, posts):
    # Only the measures that back something shown on the site. The credibility
    # appeals are validated too, but their charts are parked, so reporting their
    # accuracy here would describe results the reader cannot see.
    shown = ["political"] + C.DIRECTION_COLS
    rows = [{
        "variable": r["variable"], "label": r["label"],
        "precision": round(float(r["precision"]), 3),
        "recall": round(float(r["recall"]), 3),
        "f1": round(float(r["f1"]), 3),
        "n": int(r["n"]),
        "tier": "screen" if r["variable"] == "political" else "direction",
        "used_for": ("whether a post is political at all" if r["variable"] == "political"
                     else "partisan lean, attack and advocacy rates"),
    } for _, r in validation.iterrows() if r["variable"] in shown]
    return {
        "validation": rows,
        "model": str(posts["model"].dropna().iloc[0]) if posts["model"].notna().any() else None,
        "n_validation_posts": int(validation["n"].max()),
    }


def main():
    print("loading sources ...")
    posts, typology, affiliation, validation = load()
    print(f"  {len(posts):,} classified posts, {typology.shape[0]} accounts")

    print("building accounts ...")
    accounts, days, acc = build_accounts(posts, typology, affiliation)

    print("building overview ...")
    overview = build_overview(posts, acc, days)

    print("building quiz ...")
    quiz = build_quiz(posts, acc, overview)

    print("building methods ...")
    methods = build_methods(validation, posts)

    C.OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, payload in [("accounts", accounts), ("overview", overview),
                          ("quiz", quiz), ("methods", methods)]:
        path = C.OUT_DIR / f"{name}.json"
        path.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                        encoding="utf-8")
        print(f"  wrote {path.relative_to(C.ROOT)} ({path.stat().st_size / 1024:.0f} KB)")

    print(f"\nperception items: {len(quiz['perception'])}")
    for it in quiz["perception"]:
        print(f"  {it['key']:<16} answer {it['answer']} {it['unit']}")
    print(f"posts in window: {overview['totals']['posts_in_window']:,}")


if __name__ == "__main__":
    main()
