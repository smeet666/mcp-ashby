# Esquisse : les outils et la forme rendue

Brouillon de travail, écrit depuis les sondes du 13 août 2026 et le corpus de
1 296 offres consigné dans `SCHEMA.md`. Il fixe ce que le serveur expose et ce
qu'il rend, avant que le plan ne fixe comment.

## L'entreprise se nomme, et le serveur la confirme

Le serveur n'embarque aucun annuaire. Ashby n'offre aucune recherche transverse
et n'énumère aucune de ses clientes : il faut le jeton du board avant d'appeler.
L'appelant nomme les entreprises, `resolve_board` transforme chaque nom en
jeton, et l'API confirme.

Une liste figée aurait vieilli, et un appelant l'aurait prise pour l'ensemble des
clientes d'Ashby, alors qu'elle n'en couvrirait qu'une part arbitraire.

## Ce qui contraint chaque signature

Une seule route existe, elle ne filtre rien, elle ne pagine pas, et elle rend le
board entier à chaque fois. Le plus gros mesuré pèse 12,6 Mo et 733 offres, dont
1,25 million de tokens de seules descriptions.

Trois conséquences, qui se lisent dans tous les outils qui suivent :

1. **Aucune liste ne porte de description.** Une fiche compacte tient en une
   quinzaine de champs courts, et le texte se demande offre par offre.
2. **Tout filtre est local**, donc tout filtre doit dire ce qu'il a écarté.
3. **Le cache porte le serveur.** Le board est tenu par jeton avec son `ETag`,
   et quatre outils sur cinq travaillent sur la charge déjà descendue. Une
   session qui explore une entreprise la télécharge une fois, et la revalide par
   un `304` à corps vide.

## Les hôtes que le serveur a le droit de lire

`jobs.ashbyhq.com` interdit `/api/` dans son `robots.txt`. Le serveur ne lit que
`api.ashbyhq.com`, que la documentation d'Ashby ouvre et qui ne publie aucune
exclusion.

Cette règle se tient par trois moyens, et pas seulement par la discipline :

1. **Une liste blanche d'hôtes dans la couche HTTP.** Toute adresse dont l'hôte
   n'y figure pas lève `invalid_input` avant l'ouverture de la connexion.
2. **Un test qui espionne la couche HTTP** pendant toute la suite : chaque
   adresse demandée doit porter l'hôte autorisé. Les champs `jobUrl` et
   `applyUrl` traversent le rendu comme des chaînes et n'atteignent jamais le
   client HTTP, ce que le même test vérifie.
3. **Un canari qui relit les `robots.txt`** du domaine, et échoue si une règle
   nouvelle vise notre agent, `ClaudeBot`, ou le chemin `/posting-api/`.

Le jeton est encodé avant d'entrer dans l'URL. Le `User-Agent` porte le nom du
projet et une adresse de contact, et n'imite aucun navigateur.

## Le récapitulatif

Ce que l'API permet, et ce qui mérite d'être exposé. Les deux colonnes sont
séparées, parce qu'un outil faisable et sans intérêt coûte des tokens à chaque
appel de `tools/list`.

| Outil envisagé                    | Faisable      | Pertinent | Pourquoi                                                                                                                                                                        |
| --------------------------------- | ------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `resolve_board`                   | oui           | **oui**   | Rien ne s'appelle sans un jeton, et le jeton ne se devine pas à tous les coups                                                                                                  |
| `search_jobs`                     | oui           | **oui**   | Le cœur du serveur, `companies` requis                                                                                                                                          |
| `get_job`                         | oui           | **oui**   | Une liste ne peut pas porter le texte : la description médiane pèse 6 500 caractères                                                                                            |
| `list_filter_values`              | oui           | **oui**   | Les vocabulaires sont propres à chaque board, et 286 offres se taisent sur le télétravail                                                                                       |
| `compare_compensation`            | oui           | **oui**   | Les montants arrivent typés, en huit devises et quatre périodes : la comparaison mérite d'être explicite plutôt que devinée                                                     |
| Recherche sans entreprise nommée  | **non**       | —         | Aucun index ne traverse les clientes d'Ashby                                                                                                                                    |
| Annuaire d'entreprises embarqué   | oui           | **non**   | Une liste figée se lit comme l'ensemble des clientes, ce qu'elle n'est pas                                                                                                      |
| Recherche plein texte chez Ashby  | **non**       | —         | L'API ne filtre rien ; le mot-clé s'applique chez nous                                                                                                                          |
| Filtre sur `isListed`             | oui           | **non**   | Les 1 296 offres du corpus le portent à `true` : le filtre laisserait croire à un choix qu'aucune offre observée n'offre. Le champ se rend, sans devenir un filtre              |
| Flux transverse entre entreprises | **non**       | —         | Le flux partenaire d'Ashby demande un provisionnement et l'accord de chaque cliente : une capacité qui dépend d'un accord commercial ne s'écrit pas dans un serveur indépendant |
| Conversion de devises             | oui           | **non**   | Aucun taux n'accompagne les montants, et un taux inventé maquillerait une comparaison en calcul                                                                                 |
| Salaire médian d'un board         | oui           | **non**   | Un tiers des offres ne publie rien, et huit devises se mêlent : la médiane mentirait                                                                                            |
| Fiche d'entreprise                | partiellement | **non**   | Aucune route ne la publie ; la déduire des offres inventerait un profil                                                                                                         |
| Candidater à une offre            | —             | **non**   | `applyUrl` se rend comme un lien, et ce serveur n'écrit nulle part                                                                                                              |
| Offres récentes                   | oui           | **non**   | `published_after` sur `search_jobs` y répond sans outil de plus                                                                                                                 |

## Les cinq outils

Enregistrés dans cet ordre, qui est celui du rendu.

| Outil                  | Requêtes réseau                                         |
| ---------------------- | ------------------------------------------------------- |
| `resolve_board`        | une par forme, une au mieux                             |
| `search_jobs`          | la résolution, puis une par entreprise absente du cache |
| `get_job`              | zéro si le board est en cache                           |
| `list_filter_values`   | zéro si le board est en cache                           |
| `compare_compensation` | zéro si le board est en cache                           |

---

### `resolve_board`

Le nom d'une entreprise en entrée, le jeton qui adresse son board en sortie.
Aucun autre outil ne travaille sans lui.

**Entrée**

| Argument | Type   | Défaut   | Rôle                                        |
| -------- | ------ | -------- | ------------------------------------------- |
| `name`   | chaîne | _requis_ | un nom d'entreprise, ou un jeton déjà connu |

```jsonc
{ "name": "Eleven Labs" }
```

Le serveur essaie les formes dans l'ordre : le nom tel quel, en minuscules
collées, sans ponctuation, puis à tiret. Le jeton ignore la casse, ce qui
supprime la moitié de l'échelle qu'un service sensible à la casse imposerait.
L'échelle s'arrête à la première forme qui répond, et un plafond de formes vit
dans `config.ts` puisque chaque forme coûte une requête, une seconde, et parfois
plusieurs mégaoctets.

**Sortie**

```jsonc
{
  "input": "Eleven Labs",
  "found": [{ "board": "elevenlabs", "job_count": 247, "publishes": true }],
  "tried": ["Eleven Labs", "elevenlabs"],
  "notes": [],
}
```

Ce que les notes disent, selon le cas :

- `found: []` — aucune forme n'a répondu. La note dit que le jeton ne se déduit
  pas toujours du nom, liste les formes essayées, et écrit que ce résultat ne
  prouve pas l'absence de l'entreprise d'Ashby.
- `publishes: false` — le board existe et ne publie rien. Un jeton inconnu
  répond `404` et un board vide répond `{"jobs":[]}`, donc les deux se
  distinguent sans deviner.
- Le serveur ne prétend à aucune orthographe canonique. `jobUrl` renvoie la
  casse demandée, donc le jeton rendu est celui qui a répondu, sans être
  présenté comme la forme officielle.

---

### `search_jobs`

Le cœur du serveur. Filtre le board entier chez nous, et rend des fiches
compactes.

**Entrée**

| Argument            | Type                                           | Défaut           | Rôle                                            |
| ------------------- | ---------------------------------------------- | ---------------- | ----------------------------------------------- |
| `companies`         | tableau de chaînes                             | _requis_         | noms ou jetons, 5 par défaut, **10 au maximum** |
| `query`             | chaîne                                         | —                | mots-clés                                       |
| `search_in`         | `title` \| `title_and_description`             | `title`          | où chercher `query`                             |
| `department`        | chaîne ou tableau                              | —                | valeur du board                                 |
| `team`              | chaîne ou tableau                              | —                | valeur du board                                 |
| `employment_type`   | tableau                                        | —                | `FullTime`, `Intern`, `Contract`, `Temporary`   |
| `workplace_type`    | tableau                                        | —                | `Remote`, `Hybrid`, `OnSite`                    |
| `is_remote`         | booléen                                        | —                | ne retient que les offres qui le déclarent      |
| `country`           | chaîne ou tableau                              | —                | comparé à ce que le board publie                |
| `location_contains` | chaîne                                         | —                | sur le texte libre de `location`                |
| `published_after`   | date ISO                                       | —                | sur `publishedAt`                               |
| `has_compensation`  | booléen                                        | —                | l'entreprise publie une grille                  |
| `salary_min`        | nombre                                         | —                | exige `currency`                                |
| `currency`          | chaîne                                         | —                | code ISO, comparé sans conversion               |
| `salary_interval`   | chaîne                                         | `1 YEAR`         | période du seuil                                |
| `sort`              | `published_desc` \| `published_asc` \| `title` | `published_desc` |                                                 |
| `limit`             | entier                                         | 20               | **100 au maximum**                              |
| `offset`            | entier                                         | 0                |                                                 |

**Sortie**

```jsonc
{
  "total_on_board": 733,
  "total_matched": 12,
  "returned": 12,
  "jobs": [
    {
      "board": "openai",
      "id": "7458d4e9-da2e-47bd-98cb-adfda43d42b2",
      "title": "Engineering Manager - EU",
      "department": "Engineering",
      "team": "EMEA Engineering",
      "employment_type": "FullTime",
      "location": "Remote - European Union",
      "country": "European Union",
      "secondary_location_count": 19,
      "workplace_type": "Remote",
      "is_remote": true,
      "published_at": "2024-03-04T14:29:08.532+00:00",
      "compensation_summary": "€110K – €185K • Offers Equity • Offers Bonus",
      "job_url": "https://jobs.ashbyhq.com/openai/7458d4e9-…",
      "apply_url": "https://jobs.ashbyhq.com/openai/7458d4e9-…/application",
    },
  ],
  "per_company": [{ "input": "OpenAI", "board": "openai", "status": "read", "matched": 12 }],
  "filters_applied": { "workplace_type": ["Remote"] },
  "undeclared": { "workplace_type": 286, "compensation": 240 },
  "notes": [],
}
```

Aucune description, à aucun `limit`. La fiche compacte porte quinze champs
courts, et `get_job` sert le texte.

Les règles qui gouvernent les filtres :

- **Un filtre sur un champ non déclaré ne peut rien conclure.** 286 offres du
  corpus ne portent ni `workplaceType` ni `isRemote`. Filtrer sur
  `is_remote: false` les écarte, et leur compte sort dans `undeclared` à côté du
  résultat.
- **Le seuil de salaire ne compare qu'à devise et période égales.** Un montant
  horaire n'est pas retenu par un seuil annuel, et une offre qui publie un
  salaire dans une autre devise sort dans `salary_comparison` plutôt que dans
  `compensation` : elle a publié quelque chose, et ce quelque chose ne se
  compare pas.
- **Une valeur de filtre absente du board rend `invalid_input`** avec les
  valeurs présentes, plutôt qu'une liste vide qui se lirait comme une absence.
- **Le pays compare à ce qui est publié.** Le corpus porte `USA` et
  `United States`, `UK` et `United Kingdom`. Le serveur ne les fusionne pas ; il
  accepte un tableau, et la note nomme les orthographes voisines présentes sur
  le board.
- **`per_company` distingue quatre états** : lue, non résolue, sans offre, en
  panne. Une entreprise en panne rend `read` et `matched` à `null`, puisqu'un
  zéro se lirait comme une entreprise qui n'embauche personne.
- **`total_matched` compte les offres retenues, `total_on_board` compte le
  board.** Aucun des deux ne s'appelle « total ».

---

### `get_job`

Une offre en entier.

**Entrée**

| Argument               | Type                        | Défaut   | Rôle                                  |
| ---------------------- | --------------------------- | -------- | ------------------------------------- |
| `board`                | chaîne                      | _requis_ | jeton ou nom d'entreprise             |
| `job_id`               | UUID                        | _requis_ | l'identifiant rendu par `search_jobs` |
| `description`          | `plain` \| `html` \| `none` | `plain`  | format du texte                       |
| `include_compensation` | booléen                     | `true`   |                                       |

**Sortie**

```jsonc
{
  "board": "Ashby",
  "id": "7458d4e9-da2e-47bd-98cb-adfda43d42b2",
  "title": "Engineering Manager - EU",
  "department": "Engineering",
  "team": "EMEA Engineering",
  "employment_type": "FullTime",
  "published_at": "2024-03-04T14:29:08.532+00:00",
  "location": {
    "label": "Remote - European Union",
    "locality": null,
    "region": null,
    "country": "European Union",
  },
  "secondary_locations": [
    { "label": "Barcelona", "locality": "Barcelona", "region": "Catalonia", "country": "Spain" },
  ],
  "workplace_type": "Remote",
  "is_remote": true,
  "description": { "format": "plain", "text": "Hi 👋 I'm Colin …" },
  "compensation": {
    "published": true,
    "summary": "€110K – €185K • Offers Equity • Offers Bonus",
    "tiers": [
      {
        "title": "EU",
        "summary": "€110K – €185K • Offers Equity • Offers Bonus",
        "additional_information": null,
        "components": [
          {
            "type": "Salary",
            "min": 110000,
            "max": 185000,
            "currency": "EUR",
            "interval": "1 YEAR",
            "summary": "€110K – €185K",
          },
          {
            "type": "EquityPercentage",
            "min": null,
            "max": null,
            "currency": null,
            "interval": "NONE",
            "summary": "Offers Equity",
          },
        ],
      },
    ],
  },
  "job_url": "https://jobs.ashbyhq.com/Ashby/7458d4e9-…",
  "apply_url": "https://jobs.ashbyhq.com/Ashby/7458d4e9-…/application",
  "notes": [],
}
```

Ce qui se joue dans ce rendu :

- **La forme dépend d'une branche**, donc l'`outputSchema` la déclare en union :
  une offre sans grille rend `{ "published": false, "summary": null, "tiers": [] }`,
  et la note dit que l'entreprise ne publie pas sa rémunération. 432 offres sur
  1 296 sont dans ce cas.
- **Les composantes viennent des strates**, qui portent leurs sept clés sans
  exception. Le raccourci aplati d'Ashby omet la clé de devise sur 131
  composants, ce qui en fait une source moins sûre.
- **Une chaîne vide d'adresse devient `null`.** Le corpus écrit tantôt la clé
  absente, tantôt `""`, et les deux disent la même chose.
- **Le pays se rend tel qu'il est publié**, `European Union` compris, sans être
  corrigé.
- **Le HTML est du contenu tiers.** Il se rend sur demande explicite, jamais par
  défaut, et le texte publié n'est pas réécrit.
- **Les préfixes `Note:` et `Source:`** venus du texte de l'offre se décalent au
  rendu, pour qu'aucun texte tiers n'imite une ligne que le serveur écrit.

---

### `list_filter_values`

Le vocabulaire d'un board, avec ce qu'il compte et ce qu'il tait.

**Entrée**

| Argument | Type                                                                                                       | Défaut   | Rôle                      |
| -------- | ---------------------------------------------------------------------------------------------------------- | -------- | ------------------------- |
| `board`  | chaîne                                                                                                     | _requis_ | jeton ou nom d'entreprise |
| `facet`  | `departments` \| `teams` \| `locations` \| `countries` \| `employment_types` \| `workplace_types` \| `all` | `all`    |                           |

**Sortie**

```jsonc
{
  "board": "openai",
  "total_jobs": 733,
  "facets": {
    "departments": [{ "value": "Engineering", "count": 210 }],
    "countries": [
      { "value": "USA", "count": 402 },
      { "value": "United States", "count": 11 },
    ],
    "workplace_types": [
      { "value": "Hybrid", "count": 380 },
      { "value": "Remote", "count": 67 },
    ],
  },
  "undeclared": { "workplace_type": 286, "is_remote": 286, "compensation": 240, "country": 1 },
  "notes": [],
}
```

Chaque facette compte les offres qui la déclarent, et `undeclared` compte celles
qui se taisent : c'est ce qui empêche un appelant de lire « 447 offres classées »
comme « 447 offres du board ».

La note nomme les orthographes voisines quand un board en porte, `USA` et
`United States` par exemple, pour que l'appelant demande les deux au lieu d'en
choisir une au hasard.

---

### `compare_compensation`

Les montants publiés, mis côte à côte sans être fondus.

**Entrée**

| Argument                            | Type                                                                           | Défaut   | Rôle                                      |
| ----------------------------------- | ------------------------------------------------------------------------------ | -------- | ----------------------------------------- |
| `board`                             | chaîne                                                                         | _requis_ | jeton ou nom d'entreprise                 |
| `job_ids`                           | tableau d'UUID                                                                 | —        | les offres à comparer                     |
| _(ou)_ les filtres de `search_jobs` | —                                                                              | —        | `department`, `team`, `query`, `country`… |
| `component`                         | `Salary` \| `EquityCashValue` \| `EquityPercentage` \| `Commission` \| `Bonus` | `Salary` |                                           |
| `interval`                          | chaîne                                                                         | `1 YEAR` | période retenue                           |
| `limit`                             | entier                                                                         | 25       | 100 au maximum                            |

**Sortie**

```jsonc
{
  "board": "ramp",
  "component": "Salary",
  "interval": "1 YEAR",
  "rows": [
    {
      "job_id": "…",
      "title": "Staff Engineer",
      "tier_title": "SF/NY",
      "min": 220000,
      "max": 275000,
      "currency": "USD",
    },
  ],
  "currencies_present": ["USD", "CAD"],
  "not_published": [{ "job_id": "…", "title": "Recruiter" }],
  "other_intervals": [{ "job_id": "…", "interval": "1 HOUR" }],
  "notes": [],
}
```

Ce que cet outil refuse de faire :

- **Aucune conversion de devise.** Les rangées gardent la leur,
  `currencies_present` les nomme, et la note dit que les montants de devises
  différentes ne se classent pas entre eux.
- **Aucune somme entre types.** Un pourcentage de capital et un salaire ne
  s'additionnent pas, et `EquityPercentage` arrive d'ailleurs sans devise.
- **Aucune moyenne, aucune médiane.** Un tiers des offres ne publie rien : une
  statistique calculée sur les autres se lirait comme une statistique du board.
- **Aucune annualisation.** Les offres dont la période diffère sortent dans
  `other_intervals` au lieu d'être multipliées.
- **Les offres sans grille sortent dans `not_published`**, nommées, plutôt que
  d'être omises en silence. 709 composants du corpus portent par ailleurs une
  promesse sans chiffre — « Offers Equity » sans borne — et une borne nulle se
  rend nulle.

## Trois arbitrages, et ce qui a été retenu

- **Le seuil de `salary_min` sur une offre à plusieurs strates.** Une offre à
  huit strates porte huit fourchettes, et elle est retenue dès qu'une strate
  franchit le seuil. La ligne de `search_jobs` porte le résumé que l'entreprise
  a écrit, et `compare_compensation` nomme la strate d'où viennent les montants.
- **Le format de `published_after`.** La comparaison se fait en instants, et une
  date nue est lue en UTC. `publishedAt` porte son propre décalage, qui traverse
  le rendu intact.
- **Le plafond de taille d'un board** avant `parse_failure` : 32 Mo, réglé dans
  `config.ts`. Le plus gros board mesuré pèse 12,6 Mo, et le plafond se place
  au-dessus sans être ouvert.
