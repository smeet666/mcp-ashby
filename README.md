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

An MCP server for the public job boards companies publish through
[Ashby](https://www.ashbyhq.com). Search the postings of the companies you name,
read one in full, see the wording each board filters by, and compare the pay
ranges companies publish. No API key, no account, read-only.

[Français](#mcp-ashby-français)

## What it does

Ashby hosts one job board per company, and publishes no index across them. Every
question therefore starts with a company name, and this server turns that name
into the token that addresses its board.

```
resolve_board("Eleven Labs")                     ->  elevenlabs, 247 postings
search_jobs(["elevenlabs"], query: "engineer", is_remote: true)
get_job("elevenlabs", "a571b8e4-…")
list_filter_values("elevenlabs")
compare_compensation("ramp", department: ["Engineering"])
```

## Install

```bash
npx mcp-ashby
```

Claude Desktop, `claude_desktop_config.json`:

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

## The tools

### `resolve_board`

A company name in, the board token out. Ashby ignores the case of a token, so
`ashby`, `Ashby` and `ASHBY` answer the same board, and four spellings are tried
in order, stopping at the first that answers.

A token that names nothing and a board publishing nothing are two different
answers, and the tool keeps them apart. **Nothing found is never proof that a
company is absent from Ashby**: `elevenlabs` answers where `eleven-labs` does
not, and the answer lists the spellings that were sent.

### `search_jobs`

`companies` is required, and takes names or tokens. Each name is resolved here,
so no preparation is needed.

Ashby filters nothing at the source and pages nothing: a board arrives whole,
and every filter runs in this server. Rows carry no description, because one
board runs to megabytes and its descriptions alone to a million tokens.

Filters: `query` on titles or on descriptions, `department`, `team`,
`employment_type`, `workplace_type`, `is_remote`, `country`,
`location_contains`, `published_after`, `has_compensation`, `salary_min` with
its `currency` and its period.

Two counts come back, and neither is called a total: `total_on_board` is what
the boards hold, `total_matched` is what the criteria kept. A third count,
`undeclared`, says how many postings a criterion could say nothing about.

### `get_job`

One posting in full: its places, its description in plain text or in the
company's own markup, and the pay tiers it publishes.

### `list_filter_values`

The wording one board actually uses, with the number of postings behind each
word, and the number that declare nothing. Boards keep their own departments and
teams, and a filter written from another board's vocabulary narrows to nothing.

### `compare_compensation`

Published pay ranges side by side, one component at a time and one period at a
time. Nothing is converted between currencies, summed across components, or
averaged.

## What the answers never claim

- **A company that withholds its pay ranges publishes null**, never zero. A
  third of the postings measured are in that case.
- **A posting that records no workplace is not a posting on site.** A fifth of
  the postings measured record neither `workplace_type` nor `is_remote`, and a
  filter on remote work reports how many it set aside.
- **Amounts keep their currency and their period.** An hourly rate is never
  weighed against a yearly floor, and eight currencies never rank against each
  other.
- **A country is reported as the board spells it.** `USA` and `United States`
  appear on different boards, `European Union` appears as a country, and none of
  them is corrected. Sibling spellings on one board are named together.
- **A filter value the board never carries is refused**, with the words the
  board does publish, rather than answered with an empty list.
- **A failure is never an empty result.** A token that names nothing, a board
  publishing nothing, and a read that failed are three different answers.
- **No canonical spelling of a token is claimed.** Ashby echoes the case it was
  given, so the token reported is the form that answered.

## What it reads, and what it leaves alone

The server reads `api.ashbyhq.com`, the interface Ashby documents for companies
hosting their own careers page. An allowlist in the HTTP layer refuses every
other host before a connection opens, and a test watches every address the suite
requests.

`jobs.ashbyhq.com` disallows `/api/` in its robots.txt, and the server never
reads it. The `jobUrl` and `applyUrl` a posting carries travel through rendering
as strings, and are rendered so you can link the advert.

One request at a time, at least a second apart, a floor configuration can widen
and never narrow. A board is held between calls and revalidated with its
validator, so a session exploring one company downloads it once.

## Stability

A major version covers what a caller writes against and reads back:

- the five tool names, and the names and types of their arguments;
- the shape of what each tool returns, and the fields it carries;
- the six error codes;
- the `./client` subpath: `Client`, `Read<T>`, and the shapes it hands back.

These stay minor, and a caller who reads only what it asked for is untouched:

- a new optional argument, or a new tool;
- a new field in an answer, or a new note;
- the wording of a note, a description, or an error message;
- following a newer revision of the Model Context Protocol, which changes the
  envelope around the tools rather than the tools.

A field that Ashby stops publishing is reported as absent rather than removed
from the shape, so a schema never narrows without a major version.

## Use it as a library

The low-level client is published on its own, with the pacing, the cache and the
error taxonomy, and no protocol attached:

```js
import { Client } from "mcp-ashby/client";

const client = new Client();
const { found } = await client.resolveBoard("Ramp");
const { data } = await client.readBoard(found[0].board);
```

Errors carry one of six codes: `not_found`, `invalid_input`, `rate_limited`,
`parse_failure`, `network_error`, `timeout`. A failure is never returned as an
empty result.

## Licence

MIT. Job adverts belong to the companies that published them: credit the company
and link the page each posting carries.

---

<img src="assets/icon-128.png" alt="" width="96" align="right">

# mcp-ashby (français)

Un serveur MCP pour les pages d'emploi publiques que les entreprises publient
via [Ashby](https://www.ashbyhq.com). Cherchez dans les offres des entreprises
que vous nommez, lisez-en une en entier, consultez le vocabulaire de chaque
tableau, et comparez les rémunérations publiées. Sans clé d'API, sans compte, en
lecture seule.

## Ce qu'il fait

Ashby héberge un tableau d'offres par entreprise, et ne publie aucun index qui
les traverse. Toute question part donc d'un nom d'entreprise, et ce serveur
transforme ce nom en jeton qui adresse son tableau.

```
resolve_board("Eleven Labs")                     ->  elevenlabs, 247 offres
search_jobs(["elevenlabs"], query: "engineer", is_remote: true)
get_job("elevenlabs", "a571b8e4-…")
list_filter_values("elevenlabs")
compare_compensation("ramp", department: ["Engineering"])
```

## Installation

```bash
npx mcp-ashby
```

Claude Desktop, `claude_desktop_config.json` :

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

## Les outils

### `resolve_board`

Un nom d'entreprise en entrée, le jeton du tableau en sortie. Ashby ignore la
casse, donc `ashby`, `Ashby` et `ASHBY` répondent le même tableau, et quatre
formes sont essayées dans l'ordre, l'échelle s'arrêtant à la première qui
répond.

Un jeton qui ne nomme rien et un tableau qui ne publie rien sont deux réponses
différentes, et l'outil les garde distinctes. **Ne rien trouver ne prouve jamais
qu'une entreprise est absente d'Ashby** : `elevenlabs` répond là où
`eleven-labs` échoue, et la réponse liste les formes envoyées.

### `search_jobs`

`companies` est requis, et prend des noms ou des jetons. Chaque nom est résolu
ici, donc aucune préparation n'est nécessaire.

Ashby ne filtre rien à la source et ne pagine pas : un tableau arrive entier, et
tous les filtres tournent dans ce serveur. Les lignes ne portent aucune
description, parce qu'un tableau pèse plusieurs mégaoctets et ses descriptions
seules un million de tokens.

Les filtres : `query` sur les titres ou sur les descriptions, `department`,
`team`, `employment_type`, `workplace_type`, `is_remote`, `country`,
`location_contains`, `published_after`, `has_compensation`, `salary_min` avec sa
devise et sa période.

Deux compteurs reviennent, et aucun ne s'appelle « total » : `total_on_board`
est ce que les tableaux portent, `total_matched` ce que les critères ont retenu.
Un troisième, `undeclared`, dit sur combien d'offres un critère n'avait rien à
dire.

### `get_job`

Une offre en entier : ses lieux, sa description en texte brut ou dans le balisage
de l'entreprise, et les strates de rémunération publiées.

### `list_filter_values`

Le vocabulaire réellement employé par un tableau, avec le nombre d'offres
derrière chaque mot, et le nombre de celles qui ne déclarent rien. Chaque
tableau garde ses propres départements et équipes, et un filtre écrit depuis le
vocabulaire d'un autre tableau ne retient rien.

### `compare_compensation`

Les rémunérations publiées côte à côte, une composante à la fois et une période
à la fois. Rien n'est converti entre devises, additionné entre composantes, ni
moyenné.

## Ce que les réponses n'affirment jamais

- **Une entreprise qui retient sa grille publie `null`**, jamais zéro. Un tiers
  des offres mesurées sont dans ce cas.
- **Une offre qui ne déclare pas son mode de travail n'est pas une offre sur
  site.** Un cinquième des offres mesurées ne portent ni `workplace_type` ni
  `isRemote`, et un filtre sur le télétravail dit combien il a écartées.
- **Les montants gardent leur devise et leur période.** Un taux horaire n'est
  jamais comparé à un seuil annuel, et huit devises ne se classent pas entre
  elles.
- **Un pays est rendu tel que le tableau l'écrit.** `USA` et `United States`
  coexistent selon les tableaux, `European Union` y figure comme pays, et aucun
  n'est corrigé. Les orthographes voisines d'un même tableau sont nommées
  ensemble.
- **Une valeur de filtre que le tableau ne porte pas est refusée**, avec les
  mots qu'il publie, plutôt que répondue par une liste vide.
- **Une panne n'est jamais un résultat vide.** Un jeton qui ne nomme rien, un
  tableau qui ne publie rien et une lecture qui échoue sont trois réponses
  différentes.
- **Aucune orthographe canonique du jeton n'est revendiquée.** Ashby renvoie la
  casse reçue, donc le jeton rendu est la forme qui a répondu.

## Ce qu'il lit, et ce qu'il laisse tranquille

Le serveur lit `api.ashbyhq.com`, l'interface qu'Ashby documente pour les
entreprises hébergeant leur propre page carrières. Une liste blanche dans la
couche HTTP refuse tout autre hôte avant l'ouverture de la connexion, et un test
surveille chaque adresse demandée par la suite.

`jobs.ashbyhq.com` interdit `/api/` dans son robots.txt, et le serveur ne le lit
jamais. Les `jobUrl` et `applyUrl` que porte une offre traversent le rendu comme
des chaînes, et sont rendus pour que vous puissiez lier l'annonce.

Une requête à la fois, séparées d'une seconde au moins, plancher que la
configuration peut élargir et jamais réduire. Un tableau est tenu entre deux
appels et revalidé par son validateur, donc une session qui explore une
entreprise le télécharge une fois.

## Stabilité

Une version majeure couvre ce contre quoi un appelant écrit et ce qu'il relit :

- les cinq noms d'outils, et les noms et types de leurs arguments ;
- la forme de ce que rend chaque outil, et les champs qu'elle porte ;
- les six codes d'erreur ;
- le sous-chemin `./client` : `Client`, `Read<T>`, et les formes qu'il rend.

Restent mineurs, et n'atteignent pas un appelant qui ne lit que ce qu'il a
demandé :

- un argument optionnel de plus, ou un outil de plus ;
- un champ de plus dans une réponse, ou une note de plus ;
- la formulation d'une note, d'une description ou d'un message d'erreur ;
- le suivi d'une révision plus récente du Model Context Protocol, qui change
  l'enveloppe autour des outils plutôt que les outils.

Un champ qu'Ashby cesse de publier est rendu absent plutôt que retiré de la
forme, donc un schéma ne se rétrécit pas sans version majeure.

## Comme bibliothèque

Le client de bas niveau est publié seul, avec son rythme, son cache et sa
taxonomie d'erreurs, sans protocole attaché :

```js
import { Client } from "mcp-ashby/client";

const client = new Client();
const { found } = await client.resolveBoard("Ramp");
const { data } = await client.readBoard(found[0].board);
```

Les erreurs portent un des six codes : `not_found`, `invalid_input`,
`rate_limited`, `parse_failure`, `network_error`, `timeout`. Une panne n'est
jamais rendue comme un résultat vide.

## Licence

MIT. Les annonces appartiennent aux entreprises qui les ont publiées : créditez
l'entreprise et liez la page que porte chaque offre.
