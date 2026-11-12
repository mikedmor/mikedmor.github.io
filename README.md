# mikedmor.github.io

My project portfolio, at [mikedmor.github.io](https://mikedmor.github.io/). One page, no build step.

- **The top** fans out screenshots of three projects, with my totals from GitHub underneath.
- **On the bench** shows the latest commit on the three projects I pushed to most recently.
- **The showcase** has a section for each main project, with screenshots and a lightbox.
- **Earlier work** has smaller cards for older and paused projects.
- **Everything** lists every public repository, grouped by area. New repositories show up on their own.

GitHub's data is fetched on each visit and kept in the browser for an hour (five API calls).

## Changing it

Most of it needs no change here at all. A new repository shows up by itself, and its **GitHub
topics** decide its group: `self-hosted` or `homelab` for the home, `pinball` for pinball and
arcade, `octoprint` or `3d-printing` for 3D printing, `sim-racing` or `simhub` for sim racing.
A repository with none of them goes under "Experiments & earlier work". Its description, stars and
activity come from GitHub too.

Edit the page when you want to change how a project is presented: a new showcase section, a
project moving to "Earlier work", or a new group.

The settings are at the top of the script in `index.html`:

| Setting        | What it does                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------ |
| `SHOWCASE`     | The big sections, in order: tagline, points, screenshots (in `img/<project>/`), links, colour.   |
| `EARLIER`      | The smaller cards for older and paused projects, each with a label like "On hold".               |
| `WORLDS`       | The groups on the "Everything" map, and the GitHub topics that put a repository in each one.   |
| `SITES`        | A project's own site, when it isn't the repository's homepage.                                   |
| `NAMES`        | How to write a project's name, when the repository's name isn't how you'd say it.                |
| `DESCRIPTIONS` | A description for repositories that don't have one on GitHub.                                   |
| `HIDE`         | Repositories to leave out.                                                                       |

Screenshots are WebP, about 1600 pixels wide. Phone screenshots go in a project's `phone` setting.
A desktop app's showcase takes `frame: "app"` for a title bar instead of a browser's, and a
screenshot of a whole screen takes `frame: "screen"` for no frame at all.

A showcase with `unreleased: true` stays hidden until its repository is public, then appears on
its own (within an hour for returning visitors). Its screenshots and text are still in this
repository's source, so only add one you're happy for people to find early.

The tab icon (`favicon.ico`, `icon.png`, `apple-touch-icon.png`) is my GitHub avatar, saved here.
Save it again if the avatar changes.

A link with `site: true` is the project's own site. A repository with GitHub Pages turned on is
only linked as a site once its page answers, so a repository that has Pages on but never published
anything isn't a broken link. (In a local preview, it believes GitHub instead.)

Project sites live in their own repositories, in a `public-site/` folder published by a workflow:
[Hearth](https://github.com/mikedmor/hearth) at `/hearth/`, [Muny](https://github.com/mikedmor/muny)
at `/muny/` and [ArcadeScore](https://github.com/mikedmor/ArcadeScore) at `/ArcadeScore/`. The `google….html` file proves to Google Search Console that this domain is mine;
keep it.
