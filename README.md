# PSMI Dashboards

Interactive dashboards on political social media influencers, from the Department of Communication
and Media Research (IKMZ), University of Zurich.

The first dashboard covers the 2024 US presidential election: 140 of the most-followed political
accounts on X, Instagram and TikTok, and every post they published between 1 September and
6 November 2024. It shows how partisan each account is, how much of its output is political, whether
it attacks opponents or advocates for its own side, where its audience originally came from, and how
the rhythm of posting tracked the campaign.

## Running it

```bash
python build.py
```

```bash
python serve.py
```

Then open <http://localhost:8765>. A server is required: the pages use ES modules and `fetch`, which
browsers block on `file://`. `serve.py` is the same as Python's built-in server but disables caching,
so edits show up on reload.

## Layout

```
site/
  index.html          umbrella landing page, lists the dashboards
  about.html          the team
  assets/             shared stylesheet, app and chart code
  assets/team/        team photos (see below)
  data/               generated, not in this repository
  us-2024/            the 2024 US election dashboard and its methods page
build.py              generates site/data/*.json from the research dataset
config.py             source paths and build settings
serve.py              local development server
tools/                palette validation
```

Adding a dashboard means adding a folder alongside `us-2024/` and a card on the landing page.

## Team photos

`about.html` shows a monogram for each person until a photo exists. Drop a square image into
`site/assets/team/` named after the person, matching the filenames in `about.html`
(`eva-maria-vogel.jpg` and so on), and it replaces the monogram automatically.

## Data

`build.py` generates `site/data/*.json` from the research dataset. **That dataset is not part of this
repository**, so a fresh clone will not render until you build it with access to the source files.

The generated files contain only the measures the dashboards display. No post text and no images are
stored here. Example posts are referenced by their public URL and rendered by the platforms' own
embed players, which load only after the reader opts in.

How the data were collected and classified, how accurate each measure is, and where it should not be
trusted are described on each dashboard's own methods page.

## Built with

No framework, no build step and no dependencies: plain HTML, CSS and ES modules, with charts drawn as
inline SVG. Python and pandas for the data pipeline.

## Contact

Corrections and questions: e.vogel@ikmz.uzh.ch
