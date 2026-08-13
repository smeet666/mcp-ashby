# Ashby — étude de faisabilité

Sondée le 13 août 2026. Verdict : **GO**. L'éditeur documente la route comme
publique, ses conditions écrites ne visent que ses clientes sous contrat, et le
terrain candidat est libre.

Toutes les sondes portent un `User-Agent` nommant le projet et une adresse de
contact.

## 1. Le serveur existe-t-il déjà ? Pas de ce côté-là

Le registre officiel ne rend aucun serveur Ashby : la recherche répond par deux
homonymes sans rapport.

npm en porte quatre, et **les quatre enveloppent l'API ATS authentifiée**, celle
du recruteur : `@pipeworx/mcp-ashby`, `ashby-mcp`, `@jonzz02/ashby-mcp-server`,
`ashby-mcp-server`. Ils lisent des candidats, des évaluations et des campagnes,
avec une clé d'API. Aucun ne lit le board public, et aucun ne sert un chercheur
d'emploi.

GitHub porte trois dépôts qui touchent au board public — `ats-mcp-server`,
`jobhound`, `openhire` — tous à une étoile ou moins, tous agrégateurs
multi-sites, aucun publié sur npm ni au registre.

`mcp-ashby` est libre sur npm et sur GitHub.

## 2. Le `robots.txt`

| Hôte               | Contenu                                                |
| ------------------ | ------------------------------------------------------ |
| `api.ashbyhq.com`  | **aucun** : la route répond `401 Unauthorized`         |
| `jobs.ashbyhq.com` | `User-Agent: *`, `Disallow: /meeting/`, `/b/`, `/api/` |
| `www.ashbyhq.com`  | `Allow: /`, un `Host` et un `Sitemap`                  |

Aucun des trois ne nomme un agent, et aucun ne porte de `Content-Signal`.

Deux hôtes, deux portes sur la même donnée, et la lecture qui en découle :

- **`api.ashbyhq.com` est la porte que l'éditeur documente**, et elle ne publie
  aucune règle d'exclusion. C'est là que le serveur lit.
- **`jobs.ashbyhq.com` interdit `/api/`**, et le serveur n'y touche jamais.
- **Rendre un lien vers `jobs.ashbyhq.com` reste légitime.** Un `Disallow`
  interdit de parcourir, jamais de citer une adresse. `jobUrl` et `applyUrl`
  traversent le rendu comme des chaînes.

L'absence de `robots.txt` sur l'hôte d'API ne vaut ni permission ni interdiction
par elle-même. Ce qui fonde la lecture est la documentation de l'éditeur, traitée
au point 5.

## 3. Les conditions écrites

Les _Customer Terms of Service_, mises à jour le 29 septembre 2025, sont un
accord entre Ashby et « the corporation, LLC, partnership, sole proprietorship,
or other business entity entering into this Agreement ». Elles régissent l'achat
et l'usage du service par une entreprise cliente, et prennent effet quand cette
entreprise achète ou se connecte.

Le texte a été relu en entier. **Il ne contient ni « scraping », ni « data
mining », ni « robots », ni « extraction », ni « crawl », ni « harvest », ni
revendication de droit du producteur de base de données.** Aucune clause ne vise
un lecteur tiers d'une API publique.

Ce que les clauses lues visent en réalité : les données candidates confiées par
la cliente, les intégrations tierces qu'elle active, les données exclues qu'elle
s'interdit de téléverser, la conservation après résiliation. Le serveur ne
touche à rien de tout cela : il lit des annonces que la cliente a choisi de
publier.

Un signe supplémentaire, qui n'est pas un argument juridique mais qui dit
l'intention : l'API nomme un de ses champs
`scrapeableCompensationSalarySummary`.

## 4. Le site sert-il un agent honnête ? Oui, les quatre passent

`GET /posting-api/job-board/linear`, quatre agents :

| Agent                                   | Réponse |
| --------------------------------------- | ------- |
| `mcp-ashby/0.1.0 (+adresse de contact)` | `200`   |
| Chrome complet                          | `200`   |
| `curl/8.5.0`                            | `200`   |
| `ClaudeBot/1.0`                         | `200`   |

Aucun écart entre un navigateur et un agent nommé. Le service est derrière
Cloudflare, qui n'oppose ici aucune épreuve.

## 5. La passerelle officielle : elle est le site lui-même

`developers.ashbyhq.com` documente `posting-api/job-board/{org}` sous le titre
« Ashby Job Postings API », et écrit :

> This API allows you to get data for all currently published Job Postings for
> your organization. If you host your own careers page, you can use this data to
> populate it.

La documentation publie aussi un `llms.txt` qui s'ouvre par « Fetch the complete
documentation index » et s'adresse nommément aux agents. La route est donc une
interface publiée, dont l'usage prévu est la republication des annonces.

**Une seconde passerelle existe et reste fermée.** Les « Dedicated Partner Job
Feeds » servent un flux transverse, en JSON ou en XML, rafraîchi toutes les
heures, portant `organizationId` et `organizationName` — donc la recherche
multi-entreprises que l'API publique ne permet pas. Elle demande un
provisionnement par Ashby, puis un accord explicite de chaque cliente dans sa
console d'administration. Ce n'est pas une porte qu'un projet indépendant
pousse, et le serveur ne la suppose nulle part.

## 6. La donnée vaut-elle un serveur ? Oui, et elle est complète

18 champs peuplés sur les 1 296 offres du corpus : titre, département, équipe,
type d'emploi, lieu principal et lieux secondaires avec adresse postale,
télétravail, date de publication, description en HTML et en texte, lien de
candidature, et la grille de rémunération détaillée en composantes typées.

Le détail mesuré vit dans `SCHEMA.md`. Ce qui décide ici :

- **Deux tiers des offres publient une rémunération structurée**, avec devise,
  période, bornes et strates géographiques. C'est rare, et c'est ce qui rend le
  serveur intéressant au-delà d'une liste de titres.
- **Les descriptions sont toujours présentes**, dans les deux formats, jamais
  vides sur une seule offre.
- **Les adresses suivent schema.org**, ce qui donne un pays exploitable là où
  `location` reste un texte libre.

## Ce que l'API sait faire, et ce qu'elle refuse

|                                   |                               |
| --------------------------------- | ----------------------------- |
| Lire un board entier              | oui, une seule route          |
| Filtrer côté service              | **non**                       |
| Paginer                           | **non**                       |
| Chercher par mot-clé              | **non**                       |
| Chercher sans nommer d'entreprise | **non**                       |
| Énumérer les clientes d'Ashby     | **non**                       |
| Compresser                        | oui, `gzip`                   |
| Valider un cache                  | oui, `ETag` et `304` vérifiés |
| Annoncer un quota                 | **non**, aucun en-tête        |

## Trois pièges, tous mesurés

**1. Le poids.** Le plus gros board rend 733 offres et 12,6 Mo, dont 1,25
million de tokens de seules descriptions. Une liste qui porterait les
descriptions serait inutilisable au premier appel. Le gzip ramène ces 12,6 Mo à
1,2 Mo sur le réseau, et le `304` conditionnel rend la relecture gratuite.

**2. `includeCompensation` absent efface deux champs.** Sans le paramètre, la
charge omet `compensation` **et** `shouldDisplayCompensationOnJobPostings`. Une
offre lue sans lui est indiscernable d'une offre dont l'entreprise refuse de
publier sa grille. Le paramètre accompagne chaque requête.

**3. La casse du jeton ne se canonise pas.** L'API ignore la casse, et renvoie
dans `jobUrl` l'orthographe reçue : `ashby`, `ASHBY` et `AsHbY` répondent la
même offre sous trois adresses différentes. Aucune réponse ne révèle
l'orthographe officielle du board, et le serveur n'en annonce donc aucune.

## Les trois états d'une réponse, tous distinguables

| État                          | Réponse                               |
| ----------------------------- | ------------------------------------- |
| jeton inconnu                 | `404`, corps `Not Found`              |
| board réel sans offre publiée | `200`, `{"jobs":[],"apiVersion":"1"}` |
| board réel avec offres        | `200`, le tableau                     |

Vérifié sur les trois : `anthropic` et `mistral` répondent 404, `deel` répond un
board vide, les sept autres répondent des offres. C'est ce qui permet de ne
jamais rendre une panne ou un jeton mal deviné comme une entreprise sans
recrutement.

## Le rythme

Ashby ne publie ni `Crawl-delay`, ni limite chiffrée, ni en-tête de quota. Le
plancher est donc décidé par le poids de ce qu'on demande : **une requête à la
fois, une seconde entre deux**, que la configuration peut élargir et jamais
réduire. Une charge de plusieurs mégaoctets mérite plus de retenue qu'une API
qui rend trois kilooctets.

Le cache fait le reste : un board tenu par jeton, revalidé par `If-None-Match`,
sert quatre outils sur cinq sans redescendre.

## La découverte, et la seule porte qui existe

Il faut le jeton du board avant d'appeler, et Ashby n'énumère aucune de ses
clientes. Le jeton se devine souvent du nom, et pas toujours : `elevenlabs`
répond, `eleven-labs` répond 404, `scaleai` et `scale-ai` répondent 404 tous les
deux.

L'appelant nomme donc les entreprises, et le serveur essaie les formes connues
dans un ordre court, que la casse insensible raccourcit de moitié. Un échec se
rend comme un échec de résolution, avec les formes essayées, et jamais comme une
entreprise sans offre.

Aucun annuaire n'est embarqué : une liste figée vieillit, et un appelant la
prendrait pour l'ensemble des clientes d'Ashby.

## Deux écarts entre la documentation et la charge servie

Relevés en comparant le tableau de champs publié et les 1 296 offres reçues, et
ils rappellent que le corpus fait foi :

- **`shouldDisplayCompensationOnJobPostings` n'est pas documenté**, et il arrive
  sur les 1 296 offres. C'est lui qui dit qu'une rémunération nulle est un choix
  de l'entreprise.
- **Le tableau publié décrit `secondaryLocations[].address.addressLocality`**,
  quand la charge servie niche ces champs sous `address.postalAddress`. Le code
  lit ce qui arrive.

L'éditeur documente par ailleurs deux valeurs que le corpus n'a pas montrées :
`isListed: false`, pour une annonce accessible par lien direct seulement, et
`PartTime` parmi les types d'emploi. Les vocabulaires se traitent donc comme
ouverts, et une valeur inconnue traverse le rendu plutôt que de faire échouer la
lecture du board.

## Ce qui a été tranché

- **Le serveur lit `api.ashbyhq.com` et rien d'autre**, tenu par une liste
  blanche dans la couche HTTP, un espion sur toute la suite de tests, et un
  canari qui relit les `robots.txt` du domaine.
- **Le paramètre `includeCompensation=true` est un invariant**, testé sur chaque
  requête.
- **Le flux partenaire n'est pas supposé.** Le serveur travaille avec la seule
  route publique, et n'écrit nulle part une capacité qui dépendrait d'un accord
  commercial.
- **Aucune conversion de devise, aucune annualisation, aucune moyenne.** Le
  corpus mêle huit devises et quatre périodes, et un tiers des offres ne publie
  rien.
