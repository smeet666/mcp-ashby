# Plan d'implémentation — mcp-ashby

Serveur MCP en lecture seule sur l'API publique des annonces d'Ashby, sans clé
et sans compte.

Ce plan se lit seul. Ce qui l'a établi vit à côté : `FEASIBILITY.md` porte
l'étude du site, `SCHEMA.md` porte le schéma mesuré sur le corpus, et
`DESIGN-DRAFT.md` porte les outils et la forme rendue.

## Ce qui est acquis avant d'écrire une ligne

Sondé le 13 août 2026, avec un `User-Agent` nommant le projet et une adresse de
contact.

- **Les conditions n'interdisent rien.** Les _Customer Terms of Service_ du
  29 septembre 2025 lient l'entreprise cliente sous contrat. Le texte ne
  contient ni « scraping », ni « data mining », ni « robots », ni « extraction »,
  ni « crawl », ni revendication de droit du producteur de base de données.
- **`api.ashbyhq.com` ne publie aucun `robots.txt`** : la route répond 401.
  `www.ashbyhq.com` porte `Allow: /`.
- **`jobs.ashbyhq.com` interdit `/api/`**, sur un hôte distinct de celui que la
  documentation ouvre. Le serveur ne lit jamais cet hôte.
- **L'éditeur documente la route comme publique.** `developers.ashbyhq.com`
  décrit `posting-api/job-board/{org}` comme le moyen prévu d'alimenter une page
  carrières, et publie un `llms.txt` qui s'adresse nommément aux agents.
- **Aucun serveur MCP ne lit ce côté-là.** Le registre officiel n'en porte
  aucun. Les paquets npm existants (`@pipeworx/mcp-ashby`, `ashby-mcp`,
  `@jonzz02/ashby-mcp-server`, `ashby-mcp-server`) enveloppent tous l'API ATS
  authentifiée, côté recruteur. Trois dépôts GitHub touchent au board public et
  aucun n'est publié.
- **`mcp-ashby` est libre** sur npm et sur GitHub.

## L'API, et les deux contraintes qu'elle impose

Une seule route : `GET api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true`.

**Elle ne filtre rien et ne pagine pas.** Elle rend le board entier, toujours.
Tout filtre, tout tri, toute troncature vivent chez nous.

**Elle est lourde.** Le plus gros board mesuré rend 733 offres et 12,6 Mo, dont
1,25 million de tokens de seules descriptions. Ces deux faits gouvernent la
conception plus que tout le reste : un outil qui rendrait les descriptions en
liste serait inutilisable au premier appel.

Deux mécanismes la rendent tenable :

- **Le gzip**, que le service sert : 12,6 Mo tombent à 1,2 Mo sur le réseau.
- **L'`ETag` et `cache-control: public, max-age=60`.** Une requête conditionnelle
  portant `If-None-Match` répond 304 sans corps, vérifié. Un board déjà lu se
  relit pour le prix d'un aller-retour vide, ce qui rend plusieurs appels
  d'outils sur la même entreprise presque gratuits.

**`includeCompensation=true` est toujours envoyé.** Sans lui, la charge omet
`compensation` _et_ `shouldDisplayCompensationOnJobPostings` : le serveur serait
incapable de distinguer une entreprise qui ne publie pas ses grilles d'une
requête mal formée par lui-même.

## Architecture

La couture habituelle, la couche basse publiée seule sous `./client` :

```
src/index.ts          exécutable, transport stdio
src/server.ts         enregistrement ordonné des cinq outils
src/tools/*.ts        arguments, rendu, notes          ← importe le SDK MCP
─────────────────────────────────────────────────────  la couture
src/ashby/*.ts        http, rythme, cache, analyse     ← n'importe jamais le SDK
```

Modules de la couche basse :

| Fichier           | Rôle                                                                                |
| ----------------- | ----------------------------------------------------------------------------------- |
| `config.ts`       | hôte autorisé, intervalle minimal, plafonds, `User-Agent`, TTL du cache             |
| `hosts.ts`        | la liste blanche, et le refus de toute autre adresse                                |
| `http.ts`         | une requête à la fois, intervalle plancher, `If-None-Match`, traduction des erreurs |
| `board.ts`        | construction de la requête, lecture de la charge, `Read<T>`                         |
| `cache.ts`        | le board tenu par jeton, revalidé par `ETag`                                        |
| `resolve.ts`      | nom d'entreprise → jeton de board, par l'échelle de variantes                       |
| `filter.ts`       | les prédicats locaux, et ce qu'ils écartent                                         |
| `facets.ts`       | le dénombrement des valeurs présentes et des valeurs tues                           |
| `compensation.ts` | lecture des composantes typées, sans conversion                                     |
| `errors.ts`       | les six codes, et rien de plus                                                      |

`Read<T> = { data, cached, skipped? }`. Six codes d'erreur : `not_found`,
`invalid_input`, `rate_limited`, `parse_failure`, `network_error`, `timeout`.

## Le rythme et les hôtes

Ashby ne publie ni `Crawl-delay` ni limite chiffrée. Le plancher est donc décidé
par le poids de ce qu'on demande : **une requête à la fois, une seconde entre
deux**, plancher que la configuration peut élargir et jamais réduire, y compris
par le point d'entrée `client`. Une charge de plusieurs mégaoctets par appel
mérite un rythme plus prudent qu'une API qui rend trois kilooctets.

La liste blanche vaut le seul hôte `api.ashbyhq.com`. Toute autre adresse lève
`invalid_input` avant l'ouverture de la connexion. Les champs `jobUrl` et
`applyUrl` pointent vers `jobs.ashbyhq.com` : ils traversent le rendu comme des
chaînes et n'atteignent jamais le client HTTP.

Le jeton de board est **encodé** avant d'entrer dans l'URL. Un jeton portant une
espace produit sinon une adresse malformée que le client refuse à un endroit qui
ne sait plus dire pourquoi.

Le `User-Agent` porte le nom du projet et une adresse de contact, et n'imite
aucun navigateur.

## Les cinq outils

Enregistrés dans cet ordre, qui est celui du rendu. Leur forme détaillée vit
dans `DESIGN-DRAFT.md`.

| Outil                  | Question                                                    | Requêtes réseau                                                          |
| ---------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------ |
| `resolve_board`        | cette entreprise est-elle sur Ashby, et sous quel jeton     | une par variante, une au mieux                                           |
| `search_jobs`          | qu'est-ce qui est ouvert chez elle, filtré sur mes critères | la résolution, puis une par entreprise, ou zéro si le board est en cache |
| `get_job`              | cette offre en entier                                       | zéro si le board est en cache                                            |
| `list_filter_values`   | sur quoi ce board se filtre sans fabriquer un vide          | zéro si le board est en cache                                            |
| `compare_compensation` | combien paient ces offres, dans une même unité              | zéro si le board est en cache                                            |

**Le cache est le cœur du serveur, plus que la résolution.** Quatre outils
tournent sur la même charge : une session qui explore une entreprise la
télécharge une fois. Le cache tient le board par jeton, avec son `ETag`, et
revalide au-delà du TTL plutôt que de retélécharger.

**La résolution est courte, parce que le jeton ignore la casse.** `ashby`,
`Ashby` et `AsHbY` rendent la même chose, ce qui supprime la moitié de l'échelle
qu'un service sensible à la casse imposerait. Les formes essayées, dans l'ordre :
le nom tel quel, en minuscules collées, sans ponctuation, puis à tiret. Un
plafond de formes est réglé dans `config.ts`, puisque chaque forme coûte une
requête, une seconde, et parfois plusieurs mégaoctets.

Un cache de résolution, tenu pour la session, évite de refaire l'échelle sur une
entreprise déjà résolue.

**`search_jobs` accepte 5 entreprises par défaut et 10 au maximum.** Le plafond
est plus bas que ce qu'un service léger permettrait, parce que dix boards font
dix charges de plusieurs mégaoctets, et c'est la limite de ce qu'un appel
d'outil peut promettre.

`limit` vaut 20 par défaut et 100 au maximum, et la liste ne porte **jamais** de
description.

## Les règles de rendu

Établies sur 1 296 offres de 7 boards, et elles gouvernent les tests.

1. **Une rémunération non publiée se rend `null`**, jamais zéro et jamais une
   fourchette vide. 432 offres sur 1 296 portent
   `shouldDisplayCompensationOnJobPostings: false`, et leur `compensation` est
   entièrement nulle. La note dit que l'entreprise ne la publie pas, ce qui
   diffère d'une offre non rémunérée.
2. **`workplace_type` et `is_remote` absents se rendent `null`**, et valent
   « non déclaré ». 286 offres sur 1 296 n'en portent aucun, et les rendre
   `false` inventerait 286 postes sur site.
3. **Une entreprise qui retient sa grille et un montant qui ne se compare pas
   sont deux faits différents.** Le premier compte dans `compensation`, le
   second dans `salary_comparison`, et confondre les deux accuserait une
   entreprise d'un silence qu'elle n'a pas gardé.
4. **Un filtre sur un champ non déclaré dit ce qu'il a écarté.** Filtrer sur
   `is_remote: false` ne peut pas rendre les offres muettes : le compte de ces
   offres sort dans `undeclared`, à côté du résultat.
5. **Les montants se rendent avec leur devise et leur période**, sans conversion
   ni annualisation. Le corpus mêle huit devises, et `1 HOUR`, `1 MONTH`,
   `1 YEAR` et `NONE` coexistent. Comparer deux montants de périodes différentes
   est une erreur de catégorie, et le filtre ne compare qu'à période et devise
   égales.
6. **L'equity ne s'additionne pas au salaire.** `EquityPercentage` et
   `EquityCashValue` mesurent des choses différentes, et `EquityPercentage`
   porte `interval: "NONE"` et `currencyCode: null`. Chaque composante se rend
   typée, et aucune somme n'est calculée entre types.
7. **`min` égal à `max` se rend tel quel**, sans devenir une fourchette.
8. **Un composant sans borne se rend sans borne.** « Offers Bonus » arrive avec
   `minValue: null` et `maxValue: null` : c'est une promesse sans chiffre, et
   elle se rend comme telle.
9. **`location` est un texte libre et se rend tel quel.** Le corpus porte « San
   Francisco », « India - Remote » et « Brussels - Remote » côte à côte. Aucune
   taxonomie ne les range.
10. **Le pays vient de `address.postalAddress.addressCountry`**, et une chaîne
    vide y vaut `null`. Le corpus y écrit aussi « European Union », qui n'est pas
    un pays : la valeur se rend telle qu'elle est publiée, sans être corrigée.
11. **`secondary_locations` se rend en tableau**, jamais recollé, et
    `location` reste le lieu principal qu'Ashby désigne. 946 offres n'en portent
    aucun, jusqu'à dix-neuf pour la plus large.
12. **La description vient de `descriptionPlain`**, et `descriptionHtml` reste
    disponible sur demande explicite. Aucune liste n'en porte.
13. **`published_at` se rend en ISO 8601 tel qu'Ashby l'écrit**, décalage
    compris.
14. **Le serveur ne prétend à aucune orthographe canonique du jeton.** `jobUrl`
    renvoie la casse _demandée_ : interroger `ashby`, `ASHBY` ou `AsHbY` produit
    trois `jobUrl` différentes pour la même offre. Le serveur rend le jeton que
    l'appelant a fourni, et ne l'annonce jamais comme la forme officielle.
15. **Un jeton inconnu et un board vide sont deux états distincts.** Un jeton
    inconnu répond 404, un board sans offre répond `{"jobs":[]}` en 200, vérifié
    sur les deux. Le premier se rend `not_found`, le second se rend comme une
    entreprise présente qui ne publie rien.
16. **Un 404 ne prouve pas une absence d'Ashby.** Le jeton ne se déduit pas
    toujours du nom, et la note le dit avec les formes essayées.
17. **`total_matched` compte les offres retenues, `total_on_board` compte le
    board.** Les deux se rendent, et aucun des deux ne s'appelle « total ».
18. **`isListed` se rend comme un champ, jamais comme un filtre.** L'éditeur le
    définit comme « accessible par lien direct seulement » quand il vaut `false`,
    et les 1 296 offres du corpus le portent à `true`. Le champ traverse donc le
    rendu, et aucun filtre ne se construit sur une valeur qu'aucune offre
    observée ne prend.
19. Le texte venu du site ne doit pas pouvoir imiter une ligne que le serveur
    écrit : les préfixes `Note:` et `Source:` se décalent, et la charge
    structurée garde le texte tel qu'il a été publié.

## Ce que le serveur n'expose pas

- Une recherche sans entreprise nommée. Aucun index ne traverse les clientes
  d'Ashby, et l'éditeur n'en publie aucune liste. L'appelant nomme les
  entreprises, et le serveur transforme ces noms en jetons.
- Un annuaire d'entreprises. Une liste figée vieillit vite, et un appelant la
  prendrait pour l'ensemble des clientes d'Ashby.
- Une conversion de devises. Le corpus en mêle huit, aucun taux n'accompagne les
  montants, et un taux inventé maquillerait une comparaison en calcul.
- Une candidature. `applyUrl` se rend comme un lien, et ces serveurs n'écrivent
  nulle part.

## L'ordre du travail

C'est la partie qui gouverne, et elle ne se réordonne pas.

### 1. Les contrats, avant tout code et avant tout test

Trois documents figés d'abord, puisque les tests s'écrivent contre eux :

- **`SCHEMA.md`** : ce qu'Ashby rend, mesuré sur les 1 296 offres. Champs,
  présence, formes d'absence, vocabulaires ouverts et fermés. Le vocabulaire
  mesuré : `employmentType` vaut `FullTime`, `Intern`, `Contract` ou
  `Temporary` ; `workplaceType` vaut `Remote`, `Hybrid`, `OnSite` ou rien ;
  `compensationType` vaut `Salary`, `EquityCashValue`, `EquityPercentage`,
  `Commission` ou `Bonus`. Aucun de ces ensembles n'est déclaré fermé par
  l'éditeur, donc une valeur inconnue traverse le rendu plutôt que de faire
  échouer la lecture.
- **`DESIGN-DRAFT.md`** : les cinq outils, leurs arguments, leur sortie, leurs
  notes, et la fiche compacte que rend `search_jobs`.
- **Les schémas de sortie** : un `outputSchema` par outil, en JSON Schema, avec
  les unions là où la forme dépend d'une branche — une offre dont la
  rémunération n'est pas publiée rend une charge d'une autre forme que celle
  d'une offre qui la publie.
- **Les interfaces de la couche basse** : signatures de `board.ts`, `cache.ts`,
  `resolve.ts`, `filter.ts`, `facets.ts`, `compensation.ts`, la forme de
  `Read<T>` et celle des six erreurs.

### 2. Les tests, écrits contre ces contrats

L'agent qui écrit les tests travaille depuis `PLAN.md`, `SCHEMA.md` et les
schémas, **ne lit aucun module de `src/`**, ne modifie rien sous `src/`, et
laisse un test rouge documenté plutôt que de l'affaiblir.

Fixtures **engendrées**, jamais capturées : `scripts/build-fixtures.mjs` écrit un
corpus d'offres inventées portant les formes observées, dont les cas rares, et
un board volumineux pour éprouver les plafonds. Le corpus réel sert à écrire les
assertions, jamais à être livré.

Cas à couvrir :

- une offre à `shouldDisplayCompensationOnJobPostings: false` rend
  `compensation: null`, jamais `0` ni une fourchette vide ;
- une offre sans `workplaceType` rend `null`, et n'apparaît pas dans un filtre
  `is_remote: false` ;
- ce filtre rend le compte des offres muettes qu'il a écartées ;
- un composant `EquityPercentage` à `interval: "NONE"` et `currencyCode: null`
  traverse le rendu sans devenir un salaire ;
- un seuil de salaire annuel ne retient pas un montant horaire, et la note le
  dit ;
- deux devises différentes ne se comparent pas, et `compare_compensation` les
  sépare au lieu de les moyenner ;
- `minValue` égal à `maxValue` traverse le rendu sans devenir une fourchette ;
- un `addressCountry` à chaîne vide rend `null` ;
- « European Union » traverse le rendu sans être corrigé en pays ;
- une offre à dix-neuf `secondaryLocations` reste un tableau de dix-neuf ;
- aucune sortie de `search_jobs` ne porte de description, quel que soit `limit` ;
- une valeur de filtre absente du board rend `invalid_input` avec les valeurs
  présentes, plutôt qu'une liste vide ;
- un jeton inconnu rend `not_found`, un board vide rend une entreprise sans
  offre, et les deux notes disent des choses différentes ;
- l'échelle de variantes s'arrête à la première forme confirmée ;
- une entreprise déjà résolue dans la session ne déclenche aucune requête ;
- deux outils appelés d'affilée sur le même board déclenchent une seule
  descente, et la seconde lecture porte `cached: true` ;
- au-delà du TTL, la revalidation envoie `If-None-Match` et un 304 conserve la
  charge en cache ;
- un jeton portant une espace ou un caractère réservé est encodé, et l'adresse
  produite reste sur l'hôte autorisé ;
- `search_jobs` à 11 entreprises est refusé chez nous avant tout appel ;
- `limit` au-delà de 100 est refusé chez nous ;
- `per_company` distingue lue, non résolue et en panne ;
- une charge illisible donne `parse_failure`, une coupure `network_error`, un
  429 `rate_limited`, et aucun des trois ne donne une liste vide ;
- un argument inconnu est refusé à l'exécution, comme le déclare
  `additionalProperties: false` ;
- chaque outil déclare un `outputSchema`, et la sortie le respecte ;
- une valeur inconnue de `employmentType` ou de `compensationType` traverse le
  rendu sans faire échouer la lecture du board.

**Les tests de la liste blanche :**

- toute adresse hors `api.ashbyhq.com` lève avant la connexion ;
- un espion sur la couche HTTP vérifie que **chaque** adresse demandée pendant
  toute la suite porte l'hôte autorisé, et que `jobs.ashbyhq.com` n'est jamais
  appelé ;
- `jobUrl` et `applyUrl` traversent le rendu et n'atteignent jamais le client
  HTTP ;
- chaque requête porte `includeCompensation=true` ;
- le `User-Agent` porte le nom du projet et n'imite aucun navigateur.

Tests déterministes, aucune mesure d'horloge réelle, aucune tolérance, tout ce
qui touche au temps par `vi.useFakeTimers` avec une époque fixée. La porte est
**cinq passes consécutives identiques**, ce serveur étant neuf. Le `pretest`
construit, faute de quoi un dépôt fraîchement cloné échoue.

Une suite en direct derrière une variable d'environnement, une requête par
route, en canari nocturne à une heure qu'aucun voisin n'occupe. **Le canari relit
les `robots.txt`** des hôtes du domaine et échoue si une règle nouvelle vise
notre agent, `ClaudeBot`, ou `/posting-api/`.

### 3. Le code, sous les tests

`src/ashby/` d'abord, puis `src/tools/`, puis `server.ts`.

### 4. Les tests tournent, et on vérifie

Cinq passes identiques, et le typage sans erreur.

### 5. La revue, par agents indépendants

Un agent par angle, et aucun ne relit ce qu'il a écrit : intégrité des données,
résilience, contrat d'outils et économie de tokens, prose autonome, tics de
langage, contaminations croisées, sécurité. Puis huit personas au moins, avec de
vraies questions, dont des questions mal posées : vagues, mal orthographiées,
dans la mauvaise langue, ou supposant un filtre absent. Un chercheur d'emploi
qui demande « du remote à plus de 90k » doit apprendre qu'un tiers des offres ne
publie aucune grille, et qu'il faut nommer des entreprises.

## La pile

TypeScript, `@modelcontextprotocol/sdk` ^1.30, zod 4 via
`src/tools/arguments.ts`, vitest 4, tsup, prettier. Deux configurations tsup, une
pour npm avec les dépendances externes, une pour le bundle `.mcpb` qui les
compile dedans.

Le serveur parle la révision à handshake tant que le SDK ne livre pas
`2026-07-28`. Le jour où il livrera : `server/discover` devient obligatoire, et
`ttlMs` / `cacheScope` deviennent requis sur les résultats de `tools/list`.

## L'écriture

Tout texte se lit seul, sans connaissance d'une version précédente. Aucune
référence à un autre serveur du dossier, ni dans le code, ni dans les
commentaires, ni dans les descriptions, ni dans le README. On nomme Ashby,
puisque c'est le site que le serveur lit.

## La publication

Dans cet ordre, une seule version à la fois : npm à la main pour la première
publication, puis le tag qui déclenche le bundle `.mcpb`, la release GitHub et
l'entrée au registre officiel, dont la description est plafonnée à 100
caractères et dont l'URL de bundle se calcule au moment de publier. Ensuite
Glama, `Build` seul puis `Make Release` avec le vrai numéro. Enfin les annuaires
tiers.

Ce que le dépôt porte : README bilingue anglais puis français, LICENSE MIT,
CHANGELOG, CONTRIBUTING, SECURITY, RELEASING, LAUNCHGUIDE, `server.json`,
`glama.json`, `packaging/manifest.json`, Dockerfile, quatre workflows, FUNDING,
et deux icônes à 128 et 512.

## Ce qui reste ouvert, et se traite par du code générique

Trois comportements ne se mesurent pas poliment, et le code les traite sans les
avoir vus :

- **Les réponses en 429 et en 5xx.** Elles ne se provoquent pas sur un service
  gratuit. Un 429 donne `rate_limited`, un 5xx `network_error`, et aucun des
  deux ne donne une liste vide.
- **Une limite chiffrée.** Ashby n'en publie aucune et n'envoie aucun en-tête de
  quota. Le plancher d'une seconde tient lieu de politesse, et le canari
  surveille l'apparition d'un en-tête qui dirait autre chose.
- **Le plafond de taille d'un board.** Le plus gros mesuré pèse 12,6 Mo. Le
  client refuse une charge au-delà d'un plafond réglé dans `config.ts` avec
  `parse_failure`, plutôt que de tenir une mémoire non bornée.
