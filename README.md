# Who is in your political feed?

An interactive dashboard on the political creators who shaped social media during the 2024 US
presidential election: 140 of the most-followed political accounts on X, Instagram and TikTok,
and every post they published between 1 September and 6 November 2024.

It shows how partisan each account is, how much of its output is political, whether it attacks
opponents or advocates for its own side, where its audience originally came from, and how the
rhythm of posting tracked the campaign.

Built at the Department of Communication and Media Research (IKMZ), University of Zurich.

## Running it

```bash
python build.py
```

```bash
python -m http.server 8765 --directory site
```

Then open <http://localhost:8765>. A server is required: the page uses ES modules and `fetch`,
which browsers block on `file://`.

## Data

`build.py` generates `site/data/*.json` from the research dataset. **That dataset is not part of
this repository**, so a fresh clone will not render until you build it with access to the source
files.

The generated files contain only the measures the dashboard displays. No post text and no images
are stored here. Example posts are referenced by their public URL and rendered by the platforms'
own embed players, which load only after the reader opts in.

How the data were collected and classified, how accurate each measure is, and where it should not
be trusted are described on the site's own methods page (`site/methods.html`).

## Built with

No framework, no build step and no dependencies: plain HTML, CSS and ES modules, with charts drawn
as inline SVG. Python and pandas for the data pipeline.

## Contact

Corrections and questions: e.vogel@ikmz.uzh.ch
