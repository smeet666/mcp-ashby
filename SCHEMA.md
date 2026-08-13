# Ce qu'Ashby rend — schéma mesuré

Ce document décrit la charge de l'API publique des annonces d'Ashby, telle
qu'elle a été mesurée. Il sert de contrat : les tests s'écrivent contre lui, et
le code ne peut affirmer que ce qui y est établi.

## Le corpus

Lu le 13 août 2026 sur
`https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true`.

| Board     | Offres    | Charge    |
| --------- | --------- | --------- |
| `openai`  | 733       | 12,6 Mo   |
| `ramp`    | 135       | 2,4 Mo    |
| `Notion`  | 130       | 2,3 Mo    |
| `Cursor`  | 114       | 1,0 Mo    |
| `vanta`   | 94        | 1,5 Mo    |
| `Ashby`   | 58        | 1,9 Mo    |
| `linear`  | 32        | 0,5 Mo    |
| `deel`    | 0         | 28 octets |
| **Total** | **1 296** |           |

Les pourcentages qui suivent portent sur ces 1 296 offres.

## L'enveloppe

```json
{ "apiVersion": "1", "jobs": [/* … */] }
```

`apiVersion` vaut `"1"` sur les huit boards. `jobs` est toujours présent, et
vaut `[]` sur un board sans offre publiée.

**Deux états se distinguent, et c'est ce qui permet de ne pas fabriquer une
absence :**

| Situation                     | Réponse                                     |
| ----------------------------- | ------------------------------------------- |
| jeton inconnu                 | `404`, corps `Not Found` (9 octets)         |
| board réel sans offre publiée | `200`, corps `{"jobs":[],"apiVersion":"1"}` |

## Le paramètre `includeCompensation`

Sans `includeCompensation=true`, la charge omet **deux** champs :
`compensation` et `shouldDisplayCompensationOnJobPostings`. Une offre lue sans
ce paramètre est indiscernable d'une offre dont l'entreprise refuse de publier
sa grille. Le paramètre accompagne donc chaque requête.

## Les champs d'une offre

18 champs, jamais un de plus sur le corpus, et l'ordre des clés est stable.

| Champ                                    | Type                   | Présence sur 1 296                               |
| ---------------------------------------- | ---------------------- | ------------------------------------------------ |
| `id`                                     | UUID v4                | 1 296, unique par board                          |
| `title`                                  | chaîne                 | 1 296, jamais vide, 89 caractères au plus        |
| `department`                             | chaîne                 | 1 296, jamais vide, 56 valeurs distinctes        |
| `team`                                   | chaîne                 | 1 296, jamais vide, 163 valeurs distinctes       |
| `employmentType`                         | chaîne                 | 1 296                                            |
| `location`                               | chaîne libre           | 1 296, 56 valeurs distinctes                     |
| `secondaryLocations`                     | tableau                | 350 non vides, `[]` sur 946, jusqu'à 19 éléments |
| `publishedAt`                            | ISO 8601 avec décalage | 1 296                                            |
| `isListed`                               | booléen                | 1 296, `true` sur toutes                         |
| `isRemote`                               | booléen ou `null`      | 1 010 renseignés, **`null` sur 286**             |
| `workplaceType`                          | chaîne ou `null`       | 1 010 renseignés, **`null` sur 286**             |
| `address`                                | objet                  | 1 296                                            |
| `shouldDisplayCompensationOnJobPostings` | booléen                | 1 296, `false` sur **432**                       |
| `compensation`                           | objet                  | 1 296, entièrement nul sur ces 432               |
| `jobUrl`                                 | URL                    | 1 296, hôte `jobs.ashbyhq.com`                   |
| `applyUrl`                               | URL                    | 1 296, `jobUrl` suivi de `/application`          |
| `descriptionHtml`                        | HTML                   | 1 296, jamais vide                               |
| `descriptionPlain`                       | texte                  | 1 296, jamais vide                               |

Les 286 offres à `isRemote: null` sont exactement celles à
`workplaceType: null` : les deux champs se taisent ensemble.

## Les vocabulaires

Aucun de ces ensembles n'est déclaré fermé par l'éditeur, et sa documentation
nomme au moins une valeur que le corpus n'a pas montrée. Une valeur inconnue
traverse le rendu plutôt que de faire échouer la lecture du board.

**`employmentType`**

| Valeur      | Compte                     |
| ----------- | -------------------------- |
| `FullTime`  | 1 290                      |
| `Intern`    | 2                          |
| `Contract`  | 2                          |
| `Temporary` | 2                          |
| `PartTime`  | 0, documenté par l'éditeur |

**`workplaceType`**

| Valeur   | Compte |
| -------- | ------ |
| `Hybrid` | 664    |
| `Remote` | 238    |
| `OnSite` | 108    |
| `null`   | 286    |

**`compensationType`** : `Salary` 862, `EquityCashValue` 709,
`EquityPercentage` 132, `Commission` 63, `Bonus` 5.

**`interval`** : `1 YEAR` 1 693, `NONE` 78, `1 MONTH` 1, `1 HOUR` 1.

**`currencyCode`** : USD 1 506, CAD 20, GBP 18, EUR 14, SGD 2, SEK 2, AUD 1,
JPY 1, absent ou `null` 209.

## Les localisations

`location` est un texte libre qu'aucune taxonomie ne range. Le corpus porte
« San Francisco », « India - Remote » et « Brussels - Remote » côte à côte.

L'adresse suit le vocabulaire de schema.org :

```json
"address": { "postalAddress": {
  "addressLocality": "Barcelona", "addressRegion": "Catalonia",
  "addressCountry": "Spain", "postalCode": "" } }
```

| Sous-champ        | Présent | Chaîne vide |
| ----------------- | ------- | ----------- |
| `addressCountry`  | 1 295   | 0           |
| `addressLocality` | 1 154   | 106         |
| `addressRegion`   | 1 114   | 105         |
| `postalCode`      | 6       | 6           |

Une offre porte un `address` sans `postalAddress`. Les sous-champs manquent
parfois de la clé et portent parfois une chaîne vide : **les deux formes
signifient la même chose**, et le rendu les ramène à `null`.

`addressCountry` prend 23 valeurs distinctes, et **le corpus ne les normalise
pas** :

- `USA` et `United States` coexistent ;
- `UK` et `United Kingdom` coexistent ;
- `European Union` y figure, qui n'est pas un pays.

Un filtre par pays compare donc à ce qui est publié, et l'inventaire des valeurs
présentes est ce qui permet à l'appelant de demander les deux orthographes.

`secondaryLocations` porte des éléments de la forme `{ location, address }`, la
même que l'adresse principale, avec les mêmes chaînes vides. Une offre en porte 19.

## La rémunération

**432 offres sur 1 296 (33 %)** portent
`shouldDisplayCompensationOnJobPostings: false`, et leur `compensation` vaut :

```json
{
  "compensationTierSummary": null,
  "scrapeableCompensationSalarySummary": null,
  "compensationTiers": [],
  "summaryComponents": []
}
```

C'est une entreprise qui ne publie pas sa grille. Rendre `0`, une fourchette
vide ou une absence de poste serait une invention.

Les 864 autres portent une ou plusieurs strates :

| Strates par offre | Offres |
| ----------------- | ------ |
| 0                 | 432    |
| 1                 | 767    |
| 2                 | 59     |
| 3                 | 18     |
| 4                 | 8      |
| 5                 | 8      |
| 6                 | 3      |
| 8                 | 1      |

Une strate nomme une zone géographique ou un niveau : `SF/NY`, `Nationwide`,
`Canada`, `Zone A`. Son `title` vaut `null` sur 697 strates. 131 strates portent
un `additionalInformation` en texte libre.

**Deux listes décrivent les mêmes montants, et elles n'ont pas la même forme.**

`compensationTiers[].components` porte 7 clés sur ses 2 167 composants, sans
exception : `id`, `summary`, `compensationType`, `interval`, `currencyCode`,
`minValue`, `maxValue`.

`summaryComponents` aplatit les strates et **omet la clé `currencyCode`** sur
131 de ses 1 773 composants :

```json
{ "compensationType": "EquityPercentage", "minValue": null, "maxValue": null, "interval": "1 YEAR" }
```

La liste des strates est donc la source qui fait foi, et `summaryComponents`
sert de raccourci quand la forme suffit.

Ce que portent les montants :

- **709 composants `EquityCashValue`, 132 `EquityPercentage`, 59 `Commission` et
  5 `Bonus` n'ont aucune borne** : `minValue` et `maxValue` valent `null`. Le
  résumé y dit « Offers Equity » ou « Offers Bonus », qui est une promesse sans
  chiffre.
- **`EquityPercentage` porte `interval: "NONE"`** sur 78 composants et
  `1 YEAR` sur 54, et sa devise vaut `null` : un pourcentage de capital n'a pas
  de monnaie.
- **6 composants portent `minValue` égal à `maxValue`** : un montant unique, à
  rendre tel quel.
- Aucun composant ne porte `minValue` supérieur à `maxValue`.
- `Salary` sort de l'année une fois en mensuel et une fois en horaire. Comparer
  ces montants à un seuil annuel est une erreur de catégorie.

Deux résumés textuels accompagnent l'ensemble, et ils sont écrits par
l'entreprise : `compensationTierSummary`
(« €110K – €185K • Offers Equity • Offers Bonus ») et
`scrapeableCompensationSalarySummary` (« €110K - €185K »). Les deux valent
`null` ensemble sur les 432 offres sans grille.

## Les descriptions

`descriptionPlain` et `descriptionHtml` décrivent la même offre et diffèrent
toujours. Aucune des deux n'est vide, sur aucune offre.

- Médiane 6 500 caractères, maximum 19 500.
- Les 733 offres du plus gros board totalisent 5 millions de caractères de
  `descriptionPlain`, soit environ 1,25 million de tokens.
- Aucune n'entité HTML n'est laissée échappée dans le texte.
- Aucun `<script>` n'apparaît dans le HTML du corpus, ce qui n'autorise pas à en
  supposer l'absence : le HTML est du contenu tiers et se traite comme tel.

## Les URL

`jobUrl` vaut `https://jobs.ashbyhq.com/{jeton}/{id}` et `applyUrl` ajoute
`/application`. Les deux pointent vers un hôte que le serveur ne lit jamais.

**Le jeton dans ces URL est celui qui a été demandé.** L'API ignore la casse et
renvoie l'orthographe reçue : `ashby`, `ASHBY` et `AsHbY` répondent la même
offre sous trois `jobUrl` différentes. Aucune orthographe canonique ne se déduit
de la réponse.

## Le transport

| Fait                   | Valeur mesurée                                                 |
| ---------------------- | -------------------------------------------------------------- |
| Compression            | `content-encoding: gzip`, 12,6 Mo ramenés à 1,2 Mo             |
| Cache                  | `cache-control: public, max-age=60, stale-while-revalidate=60` |
| Validation             | `etag: W/"job-board:<sha256>"`                                 |
| Requête conditionnelle | `If-None-Match` répond `304`, corps vide, vérifié              |
| Filtres côté service   | aucun                                                          |
| Pagination             | aucune                                                         |
| En-tête de quota       | aucun                                                          |

## Ce qu'Ashby ne publie pas

- **Aucun index transverse.** Il faut connaître le jeton du board avant
  d'appeler, et l'éditeur ne publie aucune liste de ses clientes.
- **Aucune limite chiffrée**, et aucun en-tête qui en annoncerait une.
- **Aucun compteur** : le nombre d'offres est la longueur du tableau reçu.
- **Aucun champ de séniorité, de compétence ou de langue.** Ce qui s'en
  approche vit dans le titre et dans la description, en texte libre.
- **Aucune date de mise à jour.** `publishedAt` est la seule date, et le corpus
  s'étale d'avril 2021 à août 2026.
- **Aucune offre non publiée.** L'éditeur définit `isListed: false` comme une
  annonce accessible par lien direct seulement, et les 1 296 offres du corpus
  portent `true`.

## Deux écarts entre la documentation et la charge servie

Le corpus fait foi, et le code lit ce qui arrive :

- **`shouldDisplayCompensationOnJobPostings` ne figure pas dans le tableau de
  champs publié**, et arrive sur les 1 296 offres.
- **Le tableau publié décrit `secondaryLocations[].address.addressLocality`**,
  quand la charge niche ces champs sous `address.postalAddress`.

L'éditeur écrit par ailleurs qu'`addressCountry` n'est pas garanti d'être un
code pays, ce que le corpus confirme avec `USA`, `United States` et
`European Union` côte à côte.
