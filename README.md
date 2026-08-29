<img src="assets/icon-128.png" alt="" width="96" align="right">

# mcp-ashby

[![npm](https://img.shields.io/npm/v/mcp-ashby.svg)](https://www.npmjs.com/package/mcp-ashby)
[![CI](https://github.com/smeet666/mcp-ashby/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-ashby/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-ashby.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-ashby)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-ashby/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-ashby)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-ashby-bavazc?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-ashby-bavazc)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ashby&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hc2hieSJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=ashby&config=%7B%22name%22%3A%22ashby%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-ashby%22%5D%7D)

<!-- m8ven-verify: 73fc264cac412f1cc3ce6c59a1a1d662 -->

[Ashby](https://www.ashbyhq.com) is recruiting software, and every company using
it gets a public job board that comes with it. Each board carries that company's
open positions with their title, their department and team, the employment type,
the locations and whether the work is remote, the full advert, and, where the
company chose to publish it, the pay: a salary range, an equity share, a
commission or a bonus, each with the period it is quoted over. Ashby holds one
board per company and publishes no index across them.

This server connects a chat client to those boards. You name the companies you
are interested in, and it turns each name into the token that addresses its
board, searches their postings, filters them by department, team, location,
country, employment type, remoteness, recency or pay, reads one posting in full,
lists the words each board actually uses, and puts the pay of several postings
side by side. It needs no API key and no account.

_[Version française](#mcp-ashby-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ashby&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hc2hieSJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=ashby&config=%7B%22name%22%3A%22ashby%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-ashby%22%5D%7D)

**Claude Code**

```bash
claude mcp add ashby -- npx -y mcp-ashby
```

**Claude Desktop, Cursor, and any client using the standard config format**

```json
{
  "mcpServers": {
    "ashby": {
      "command": "npx",
      "args": ["-y", "mcp-ashby"]
    }
  }
}
```

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "ashby": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-ashby:2.0.1"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`api.ashbyhq.com`, and nothing else: no volume, no port, no credential.

### Bundle, without npm

Download `mcp-ashby-2.0.1.mcpb` from
[the latest release](https://github.com/smeet666/mcp-ashby/releases/latest) and
open it. A client that supports MCP bundles installs it on its own, with no npm
and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- "Is Ramp hiring on Ashby?"
- "Find me remote design roles at Ramp and Linear."
- "Read me that posting in full."
- "What departments does that board file its jobs under?"
- "Put the salaries of those engineering postings side by side."

Every question starts from a company, since Ashby offers no search across boards.
`search_jobs` resolves the names you give it, so no preparation is needed:

```
resolve_board(["Ramp"])          ->  ramp, publishing
search_jobs(["Ramp"], query: "designer", is_remote: true)
get_job("ramp", "b0c8…")
```

## Tools

| Tool                   | What it does                                                       |
| ---------------------- | ------------------------------------------------------------------ |
| `resolve_board`        | Turns a company name into the Ashby board token.                   |
| `search_jobs`          | Searches the postings of the companies you name.                   |
| `get_job`              | Reads one posting in full, advert included.                        |
| `list_filter_values`   | Lists the words one board uses, with how many postings carry each. |
| `compare_compensation` | Puts one pay component of several postings side by side.           |

Every board keeps its own departments and teams, so a filter written from another
board's vocabulary narrows to nothing. `list_filter_values` publishes the words a
board actually uses.

### `resolve_board`

Turns a company name into the token that addresses its Ashby board.

| Argument | Type   | Required | What it does                                              |
| -------- | ------ | -------- | --------------------------------------------------------- |
| `name`   | string | yes      | A company name, or an Ashby board token you already know. |

**In return:** `found`, the boards that answered, and `tried`, the forms actually
sent in order. Four forms are tried per name, so nothing found is never proof
that a company is absent from Ashby.

### `search_jobs`

Searches the postings of the companies named. Ashby serves a whole board at once,
and every restriction below is applied to what was read.

| Argument            | Type                                                                   | Required | What it does                                           |
| ------------------- | ---------------------------------------------------------------------- | -------- | ------------------------------------------------------ |
| `companies`         | array of 1 to 10 strings                                               | yes      | Company names or board tokens.                         |
| `query`             | string                                                                 | no       | Words to look for.                                     |
| `search_in`         | `title` or `title_and_description`, default `title`                    | no       | Where `query` is looked for.                           |
| `department`        | one string or a list of up to 10                                       | no       | Departments as the board spells them.                  |
| `team`              | one string or a list of up to 10                                       | no       | Teams as the board spells them.                        |
| `employment_type`   | one string or a list of up to 6                                        | no       | Employment types.                                      |
| `workplace_type`    | one string or a list of up to 4                                        | no       | Workplace types.                                       |
| `is_remote`         | boolean                                                                | no       | Keep the postings marked remote.                       |
| `country`           | one country or a list of up to 10                                      | no       | Countries as the board spells them.                    |
| `location_contains` | string                                                                 | no       | Part of a location line.                               |
| `published_after`   | an ISO 8601 date                                                       | no       | How recent a posting has to be.                        |
| `has_compensation`  | boolean                                                                | no       | Keep the postings whose company publishes a pay range. |
| `salary_min`        | number, 0 or more                                                      | no       | A floor for the salary component.                      |
| `currency`          | three-letter code                                                      | no       | The currency the floor is written in.                  |
| `salary_interval`   | string, default `1 YEAR`                                               | no       | The period the floor belongs to.                       |
| `sort`              | `published_desc`, `published_asc` or `title`, default `published_desc` | no       | How the rows are ordered.                              |
| `limit`             | integer, 1 to 100, default `20`                                        | no       | Postings to serve.                                     |
| `offset`            | integer, 0 to 10000, default `0`                                       | no       | Postings to skip.                                      |

**In return:** `jobs`, each carrying `board` and `id`, which `get_job` takes
together, plus `title`, `department`, `team`, `employment_type`, `location`,
`country`, `secondary_location_count`, `workplace_type`, `is_remote`,
`published_at` with the offset Ashby publishes, `compensation_summary`, `job_url`
and `apply_url`. **The rows carry no advert text, at any limit.**
`total_on_board` counts the postings the boards read hold, `total_matched` those
the criteria kept, and `returned` those in this answer: three different numbers.
`per_company` gives one outcome per company with its `status`, `filters_applied`
echoes what was applied, and `undeclared` counts the postings that declare
nothing on a field being filtered, so a restriction never silently swallows them.

### `get_job`

Reads one posting in full.

| Argument               | Type                                       | Required | What it does                             |
| ---------------------- | ------------------------------------------ | -------- | ---------------------------------------- |
| `board`                | string                                     | yes      | A company name, or an Ashby board token. |
| `job_id`               | string                                     | yes      | The identifier a search row carries.     |
| `description`          | `plain`, `html` or `none`, default `plain` | no       | How to serve the advert.                 |
| `include_compensation` | boolean, default `true`                    | no       | Carry the pay the company published.     |

The advert runs to thousands of characters, and `html` is the company's own
markup, unrewritten.

**In return:** the posting a search row carries, with its description, its
locations and the pay components the company published.

### `list_filter_values`

Lists the words one board actually uses, with how many postings carry each.

| Argument | Type                                                                                                            | Required | What it does                      |
| -------- | --------------------------------------------------------------------------------------------------------------- | -------- | --------------------------------- |
| `board`  | string                                                                                                          | yes      | A company name, or a board token. |
| `facet`  | `departments`, `teams`, `locations`, `countries`, `employment_types`, `workplace_types` or `all`, default `all` | no       | Which vocabulary to read.         |

**In return:** `facets`, each value with the number of postings carrying it, and
`undeclared`, the postings declaring nothing on that facet. `sibling_spellings`
names the wordings that differ only in case or spacing, which a filter would
otherwise treat as two different things.

### `compare_compensation`

Puts one pay component of several postings side by side.

| Argument     | Type                                                                                       | Required | What it does                      |
| ------------ | ------------------------------------------------------------------------------------------ | -------- | --------------------------------- |
| `board`      | string                                                                                     | yes      | A company name, or a board token. |
| `job_ids`    | array of up to 50 strings                                                                  | no       | The postings to compare.          |
| `department` | one string or a list of up to 10                                                           | no       | Compare a department instead.     |
| `team`       | one string or a list of up to 10                                                           | no       | Compare a team instead.           |
| `query`      | string                                                                                     | no       | Words to look for in the titles.  |
| `component`  | `Salary`, `EquityCashValue`, `EquityPercentage`, `Commission` or `Bonus`, default `Salary` | no       | Which component to compare.       |
| `interval`   | string, default `1 YEAR`                                                                   | no       | The period compared.              |
| `limit`      | integer, 1 to 100, default `25`                                                            | no       | Postings to compare.              |

**One component at a time:** a share of capital and a salary do not add up.
Postings quoted over another period are listed apart, unconverted.

**In return:** `rows`, one per posting, with the `component` and the `interval`
they were compared on, `currencies_present` naming every currency in the answer,
and `not_published` listing the postings whose company published nothing, which
is never the same as zero.

## What a pay figure means

A company publishes what it chooses. A posting without a range comes back with
none, never with a zero. A range is reported in the currency and over the period
Ashby carries it in, and it is never converted or annualised: comparing two
postings quoted over different periods is left to whoever knows what the
comparison is for.

## Configuration

Nothing has to be configured. The server reads no environment variable, and the
`mcpServers` block above is complete as written.

The pacing, the timeout and the cache are settings of the client layer, which
[As a library](#as-a-library) shows how to pass. The interval between two
requests can be widened there and never narrowed.

## Errors

Every failure carries one of six codes, a message, and where it helps the values
that would have been accepted.

| Code            | What happened                                           | What to do                                                                        |
| --------------- | ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `not_found`     | Ashby answered, and holds no such board or posting.     | Check the token with `resolve_board`.                                             |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument and what it takes.                     |
| `rate_limited`  | Ashby asked this client to slow down.                   | Wait, then call again with the same arguments. The posting is still on the board. |
| `parse_failure` | Ashby answered in a shape this client cannot read.      | Report it at [the issue tracker](https://github.com/smeet666/mcp-ashby/issues).   |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                |
| `timeout`       | The request passed its deadline.                        | Ask for fewer companies, or a smaller `limit`.                                    |

## As a library

The layer reading Ashby is published on its own, with its pacing, its cache and
its errors, and with no protocol attached.

```ts
import { Client } from "mcp-ashby/client";

const client = new Client({ minIntervalMs: 2000 });
const resolved = await client.resolveBoard("Ramp");
console.log(resolved.found);
```

`ClientOptions` takes `minIntervalMs`, `timeoutMs`, `cacheTtlMs` and `fetchImpl`.
An interval below the published floor is ignored, so the floor holds here as
well.

## Pacing and attribution

Requests go out one at a time with at least a second between them, and that floor
holds however the client is configured. Ashby serves a whole board in one
response, which can weigh megabytes, so a single question about one company costs
one request and this server holds the answer briefly rather than asking again.
The `User-Agent` carries the project and an address where a person can be
reached, and imitates no browser.

Every posting carries the address of its Ashby page and its apply URL. Credit the
company and link that page when you show a posting.

This MCP server is an unofficial project, with no affiliation to Ashby or to the
companies whose boards it reads.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `api.ashbyhq.com` and nothing else, holds its answers
in memory while it runs, and writes nothing to disk.
[PRIVACY.md](PRIVACY.md) states what a request carries and which settings change
any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
service itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-ashby/issues). Pull requests
are welcome; opening an issue first helps agree on the shape of the change. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The postings belong to the companies that published
them.

---

<a name="mcp-ashby-français"></a>

# mcp-ashby (français)

_[English version](#mcp-ashby)_

[Ashby](https://www.ashbyhq.com) est un logiciel de recrutement, et chaque
entreprise qui l'utilise reçoit avec lui un site d'offres public. Chaque site
porte les postes ouverts de cette entreprise avec leur intitulé, leur département
et leur équipe, le type de contrat, les lieux et le caractère distant du travail,
l'annonce complète, et, quand l'entreprise a choisi de le publier, la
rémunération : une fourchette de salaire, une part de capital, une commission ou
une prime, chacune avec la période sur laquelle elle est exprimée. Ashby héberge
un site par entreprise et ne publie aucun index les traversant.

Ce serveur relie un client de conversation à ces sites. Vous nommez les
entreprises qui vous intéressent, et il traduit chaque nom en le jeton qui
adresse son site, cherche dans leurs offres, les filtre par département, équipe,
lieu, pays, type de contrat, télétravail, fraîcheur ou rémunération, lit une
offre en entier, liste les mots que chaque site emploie réellement, et met les
rémunérations de plusieurs offres côte à côte. Aucune clé d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=ashby&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1hc2hieSJdfQ%3D%3D)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=ashby&config=%7B%22name%22%3A%22ashby%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-ashby%22%5D%7D)

**Claude Code**

```bash
claude mcp add ashby -- npx -y mcp-ashby
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

```json
{
  "mcpServers": {
    "ashby": {
      "command": "npx",
      "args": ["-y", "mcp-ashby"]
    }
  }
}
```

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "ashby": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-ashby:2.0.1"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `api.ashbyhq.com`, et de rien d'autre : aucun volume, aucun port,
aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-ashby-2.0.1.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-ashby/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Est-ce que Ramp recrute sur Ashby ? »
- « Trouve-moi des postes de design en télétravail chez Ramp et Linear. »
- « Lis-moi cette offre en entier. »
- « Sous quels départements ce site classe-t-il ses offres ? »
- « Mets côte à côte les salaires de ces offres d'ingénierie. »

Chaque question part d'une entreprise, puisque Ashby n'offre aucune recherche
traversant les sites. `search_jobs` résout lui-même les noms qu'on lui donne,
donc rien n'est à préparer :

```
resolve_board(["Ramp"])          ->  ramp, publie
search_jobs(["Ramp"], query: "designer", is_remote: true)
get_job("ramp", "b0c8…")
```

## Les outils

| Outil                  | Ce qu'il fait                                                       |
| ---------------------- | ------------------------------------------------------------------- |
| `resolve_board`        | Traduit un nom d'entreprise en jeton de site Ashby.                 |
| `search_jobs`          | Cherche dans les offres des entreprises nommées.                    |
| `get_job`              | Lit une offre en entier, annonce comprise.                          |
| `list_filter_values`   | Liste les mots qu'un site emploie, et combien d'offres les portent. |
| `compare_compensation` | Met une composante de rémunération de plusieurs offres côte à côte. |

Chaque site garde ses propres départements et équipes, donc un filtre écrit dans
le vocabulaire d'un autre site ne retient rien. `list_filter_values` publie les
mots qu'un site emploie réellement.

### `resolve_board`

Traduit un nom d'entreprise en le jeton qui adresse son site Ashby.

| Argument | Type   | Requis | Ce qu'il fait                                      |
| -------- | ------ | ------ | -------------------------------------------------- |
| `name`   | chaîne | oui    | Un nom d'entreprise, ou un jeton Ashby déjà connu. |

**En retour :** `found`, les sites qui ont répondu, et `tried`, les formes
réellement envoyées dans l'ordre. Quatre formes sont essayées par nom, donc ne
rien trouver ne prouve jamais qu'une entreprise est absente d'Ashby.

### `search_jobs`

Cherche dans les offres des entreprises nommées. Ashby sert un site entier d'un
coup, et chaque restriction ci-dessous s'applique à ce qui a été lu.

| Argument            | Type                                                                  | Requis | Ce qu'il fait                                                     |
| ------------------- | --------------------------------------------------------------------- | ------ | ----------------------------------------------------------------- |
| `companies`         | tableau de 1 à 10 chaînes                                             | oui    | Noms d'entreprises ou jetons.                                     |
| `query`             | chaîne                                                                | non    | Les mots à chercher.                                              |
| `search_in`         | `title` ou `title_and_description`, défaut `title`                    | non    | Où `query` est cherché.                                           |
| `department`        | une chaîne ou une liste jusqu'à 10                                    | non    | Départements comme le site les écrit.                             |
| `team`              | une chaîne ou une liste jusqu'à 10                                    | non    | Équipes comme le site les écrit.                                  |
| `employment_type`   | une chaîne ou une liste jusqu'à 6                                     | non    | Types de contrat.                                                 |
| `workplace_type`    | une chaîne ou une liste jusqu'à 4                                     | non    | Modes de travail.                                                 |
| `is_remote`         | booléen                                                               | non    | Ne garder que les offres en télétravail.                          |
| `country`           | un pays ou une liste jusqu'à 10                                       | non    | Pays comme le site les écrit.                                     |
| `location_contains` | chaîne                                                                | non    | Une partie d'une ligne de lieu.                                   |
| `published_after`   | une date ISO 8601                                                     | non    | L'ancienneté maximale d'une offre.                                |
| `has_compensation`  | booléen                                                               | non    | Ne garder que les offres dont l'entreprise publie une fourchette. |
| `salary_min`        | nombre, 0 ou plus                                                     | non    | Un plancher pour la composante salaire.                           |
| `currency`          | code à trois lettres                                                  | non    | La devise du plancher.                                            |
| `salary_interval`   | chaîne, défaut `1 YEAR`                                               | non    | La période à laquelle le plancher se rapporte.                    |
| `sort`              | `published_desc`, `published_asc` ou `title`, défaut `published_desc` | non    | L'ordre des lignes.                                               |
| `limit`             | entier, 1 à 100, défaut `20`                                          | non    | Offres à servir.                                                  |
| `offset`            | entier, 0 à 10000, défaut `0`                                         | non    | Offres à enjamber.                                                |

**En retour :** `jobs`, chacune portant `board` et `id`, que `get_job` reprend
ensemble, plus `title`, `department`, `team`, `employment_type`, `location`,
`country`, `secondary_location_count`, `workplace_type`, `is_remote`,
`published_at` avec le décalage horaire qu'Ashby publie, `compensation_summary`,
`job_url` et `apply_url`. **Les lignes ne portent pas l'annonce, quelle que soit
la limite.** `total_on_board` compte les offres que contiennent les sites lus,
`total_matched` celles que les critères ont retenues, et `returned` celles de
cette réponse : trois nombres différents. `per_company` donne une issue par
entreprise avec son `status`, `filters_applied` redonne ce qui a été appliqué, et
`undeclared` compte les offres qui ne déclarent rien sur un champ filtré, pour
qu'une restriction ne les avale jamais en silence.

### `get_job`

Lit une offre en entier.

| Argument               | Type                                      | Requis | Ce qu'il fait                           |
| ---------------------- | ----------------------------------------- | ------ | --------------------------------------- |
| `board`                | chaîne                                    | oui    | Un nom d'entreprise, ou un jeton Ashby. |
| `job_id`               | chaîne                                    | oui    | L'identifiant que porte une ligne.      |
| `description`          | `plain`, `html` ou `none`, défaut `plain` | non    | Comment servir l'annonce.               |
| `include_compensation` | booléen, défaut `true`                    | non    | Porter la rémunération publiée.         |

L'annonce fait des milliers de caractères, et `html` est le balisage de
l'entreprise, non réécrit.

**En retour :** l'offre que porte une ligne de recherche, avec sa description,
ses lieux et les composantes de rémunération que l'entreprise a publiées.

### `list_filter_values`

Liste les mots qu'un site emploie réellement, et combien d'offres portent chacun.

| Argument | Type                                                                                                           | Requis | Ce qu'il fait                     |
| -------- | -------------------------------------------------------------------------------------------------------------- | ------ | --------------------------------- |
| `board`  | chaîne                                                                                                         | oui    | Un nom d'entreprise, ou un jeton. |
| `facet`  | `departments`, `teams`, `locations`, `countries`, `employment_types`, `workplace_types` ou `all`, défaut `all` | non    | Le vocabulaire à lire.            |

**En retour :** `facets`, chaque valeur avec le nombre d'offres qui la portent,
et `undeclared`, les offres qui ne déclarent rien sur cette facette.
`sibling_spellings` nomme les formulations qui ne diffèrent que par la casse ou
les espaces, qu'un filtre traiterait sinon comme deux choses distinctes.

### `compare_compensation`

Met une composante de rémunération de plusieurs offres côte à côte.

| Argument     | Type                                                                                      | Requis | Ce qu'il fait                           |
| ------------ | ----------------------------------------------------------------------------------------- | ------ | --------------------------------------- |
| `board`      | chaîne                                                                                    | oui    | Un nom d'entreprise, ou un jeton.       |
| `job_ids`    | tableau jusqu'à 50 chaînes                                                                | non    | Les offres à comparer.                  |
| `department` | une chaîne ou une liste jusqu'à 10                                                        | non    | Comparer un département.                |
| `team`       | une chaîne ou une liste jusqu'à 10                                                        | non    | Comparer une équipe.                    |
| `query`      | chaîne                                                                                    | non    | Les mots à chercher dans les intitulés. |
| `component`  | `Salary`, `EquityCashValue`, `EquityPercentage`, `Commission` ou `Bonus`, défaut `Salary` | non    | La composante comparée.                 |
| `interval`   | chaîne, défaut `1 YEAR`                                                                   | non    | La période comparée.                    |
| `limit`      | entier, 1 à 100, défaut `25`                                                              | non    | Offres à comparer.                      |

**Une composante à la fois :** une part de capital et un salaire ne s'additionnent
pas. Les offres exprimées sur une autre période sont listées à part, sans
conversion.

**En retour :** `rows`, une par offre, avec le `component` et l'`interval` sur
lesquels elles ont été comparées, `currencies_present` qui nomme chaque devise
présente dans la réponse, et `not_published` qui liste les offres dont
l'entreprise n'a rien publié, ce qui ne vaut jamais zéro.

## Ce que dit un chiffre de rémunération

Une entreprise publie ce qu'elle veut. Une offre sans fourchette revient sans
rien, jamais avec un zéro. Une fourchette est rendue dans la devise et sur la
période où Ashby la porte, et elle n'est jamais convertie ni annualisée :
comparer deux offres exprimées sur des périodes différentes est laissé à qui sait
à quoi la comparaison doit servir.

## Configuration

Il n'y a rien à configurer. Le serveur ne lit aucune variable d'environnement, et
le bloc `mcpServers` ci-dessus est complet tel quel.

Le rythme, le délai et le cache sont des réglages de la couche cliente, que
[Comme bibliothèque](#comme-bibliothèque) montre comment passer. L'écart entre
deux requêtes peut y être élargi et jamais resserré.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide les valeurs
qui auraient été acceptées.

| Code            | Ce qui s'est passé                                       | Que faire                                                                             |
| --------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `not_found`     | Ashby a répondu, et n'a ni ce site ni cette offre.       | Vérifiez le jeton avec `resolve_board`.                                               |
| `invalid_input` | Les arguments ont été refusés avant toute requête.       | Lisez le message, qui nomme l'argument et ce qu'il prend.                             |
| `rate_limited`  | Ashby demande à ce client de ralentir.                   | Attendez, puis rappelez avec les mêmes arguments. L'offre est toujours en ligne.      |
| `parse_failure` | Ashby a répondu dans une forme que ce client ne lit pas. | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-ashby/issues). |
| `network_error` | La requête n'a pas abouti.                               | Réessayez sous peu.                                                                   |
| `timeout`       | La requête a dépassé son délai.                          | Demandez moins d'entreprises, ou un `limit` plus petit.                               |

## Comme bibliothèque

La couche qui lit Ashby est publiée seule, avec son rythme, son cache et ses
erreurs, sans protocole attaché.

```ts
import { Client } from "mcp-ashby/client";

const client = new Client({ minIntervalMs: 2000 });
const resolved = await client.resolveBoard("Ramp");
console.log(resolved.found);
```

`ClientOptions` prend `minIntervalMs`, `timeoutMs`, `cacheTtlMs` et `fetchImpl`.
Un écart sous le plancher publié est ignoré, donc le plancher tient également
ici.

## Rythme et attribution

Les requêtes partent une à une avec au moins une seconde entre elles, et ce
plancher tient quelle que soit la configuration du client. Ashby sert un site
entier en une réponse, qui peut peser plusieurs mégaoctets, donc une question sur
une entreprise coûte une requête et ce serveur garde brièvement la réponse plutôt
que de redemander. Le `User-Agent` porte le projet et une adresse où joindre une
personne, et n'imite aucun navigateur.

Chaque offre porte l'adresse de sa page Ashby et son adresse de candidature.
Créditez l'entreprise et renvoyez vers cette page quand vous montrez une offre.

Ce MCP est un projet non officiel, sans affiliation à Ashby ni aux entreprises
dont il lit les sites.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `api.ashbyhq.com`, garde ses réponses en mémoire le
temps qu'il tourne, et n'écrit rien sur le disque. [PRIVACY.md](PRIVACY.md) dit
ce qu'une requête emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre le service lui-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-ashby/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les offres appartiennent aux entreprises qui les
ont publiées.
