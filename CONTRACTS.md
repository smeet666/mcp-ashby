# Les contrats de la couche basse

Ce document est ce que les tests décrivent. Il s'écrit avant eux, et le code
s'écrit après eux.

Il porte les signatures, les préconditions et les postconditions de chaque
module sous `src/ashby/`, plus les invariants qui traversent la couche entière.
Ce que la charge d'Ashby contient vit dans `SCHEMA.md`, et ce que les outils en
rendent vit dans `DESIGN-DRAFT.md`.

## La couture

```
src/index.ts          exécutable, transport stdio
src/server.ts         enregistrement ordonné des cinq outils
src/tools/*.ts        arguments, rendu, notes          ← importe le SDK MCP
─────────────────────────────────────────────────────  la couture
src/ashby/*.ts        http, rythme, cache, analyse     ← n'importe jamais le SDK
```

Un module sous `src/ashby/` qui importerait le SDK romprait le point d'entrée
`./client`, qui est publié seul pour être consommé comme une bibliothèque
ordinaire. Un test le vérifie sur l'arbre entier.

## Les deux types que tout le monde partage

```ts
interface Read<T> {
  data: T;
  cached: boolean;
  skipped?: string[];
}
```

`cached` dit d'où vient la donnée. `skipped` nomme ce qu'une lecture a écarté,
et reste absent quand elle n'a rien écarté.

```ts
type ErrorCode =
  "not_found" | "invalid_input" | "rate_limited" | "parse_failure" | "network_error" | "timeout";
```

Six codes, pas un de plus. **Aucune panne ne se rend comme un résultat vide.**
`isAshbyError` reconnaît les erreurs par leur forme et jamais par identité de
classe : le paquet expose deux points d'entrée, chacun portant sa copie du
module.

## Les invariants de la couche

Ils valent pour tout module, et chacun a son test.

1. **Une seule adresse est joignable.** `assertAllowed` refuse tout hôte hors
   `api.ashbyhq.com`, et tout protocole autre que `https`, avant l'ouverture de
   la connexion. `jobUrl` et `applyUrl` traversent le rendu comme des chaînes.
2. **`includeCompensation=true` voyage sur chaque requête.** Sans lui la charge
   perd `compensation` et `shouldDisplayCompensationOnJobPostings` ensemble.
3. **Le jeton est encodé** avant d'entrer dans l'adresse.
4. **Le `User-Agent` porte le projet et un contact**, et n'imite aucun
   navigateur.
5. **Une requête à la fois, une seconde entre deux**, plancher que la
   configuration élargit et ne réduit jamais, `client` publié compris.
6. **Aucun vocabulaire n'est fermé.** Une valeur inconnue traverse la lecture.
7. **Un `null` n'est pas une valeur.** Ni `0`, ni `false`, ni chaîne vide.

## Module par module

### `config.ts`

Constantes et `boardUrl(board)`. `resolveInterval(requested)` rend le plus grand
du plancher et de la demande, et rend le plancher pour une valeur non finie.

`boardUrl` encode le jeton et pose toujours `includeCompensation=true`.

### `hosts.ts`

```ts
assertAllowed(url: string): URL
```

Rend l'URL analysée quand l'hôte figure dans la liste. Lève `invalid_input`
autrement, et le message nomme l'hôte refusé.

### `errors.ts`

Les six constructeurs, la classe, et `isAshbyError`. Rien d'autre.

### `rateLimiter.ts`

```ts
schedule<T>(task: () => Promise<T>): Promise<T>
pause(ms: number): void
```

- Deux tâches programmées ensemble s'exécutent séparées d'au moins
  l'intervalle.
- L'ordre de départ est celui de la programmation.
- `pause` retarde le prochain départ, sans annuler la tâche en vol.
- Une tâche qui échoue ne bloque pas la file.

Tout se mesure en horloge simulée. Aucune tolérance, aucune mesure d'horloge
réelle.

### `cache.ts`

```ts
get(key): CacheEntry<T> | undefined
isFresh(entry): boolean
set(key, value, etag): void
touch(key): void
```

- `get` rend l'entrée fraîche **et** l'entrée périmée : une entrée périmée
  porte le validateur qui permet de la revalider.
- `isFresh` est faux à partir de `ttlMs`, borne comprise.
- `set` au-delà de `maxEntries` évince la moins récemment lue.
- Une absence se met en cache comme une valeur : résoudre une entreprise sonde
  plusieurs orthographes, et redemander la même manquante ne se paie pas deux
  fois.

### `http.ts`

```ts
getJson<T>(url, options, conditional?): Promise<HttpResult<T>>
```

Postconditions :

| Situation                       | Résultat                                                          |
| ------------------------------- | ----------------------------------------------------------------- |
| 200 avec un corps lisible       | `{ status: "ok", body, etag }`                                    |
| 304                             | `{ status: "unchanged" }`                                         |
| 404                             | lève `not_found`                                                  |
| 429                             | lève `rate_limited`, `retryAfterMs` posé quand l'en-tête le nomme |
| 5xx                             | lève `network_error`                                              |
| corps illisible                 | lève `parse_failure`                                              |
| corps au-delà de `maxBodyBytes` | lève `parse_failure`                                              |
| délai dépassé                   | lève `timeout`                                                    |
| hôte hors liste                 | lève `invalid_input`, sans connexion                              |

L'en-tête `Accept-Encoding` accepte gzip. `If-None-Match` part quand un
validateur est fourni.

### `board.ts`

```ts
readBoard(board, reader): Promise<Read<RawJob[]>>
probeBoard(board, reader): Promise<{ exists, jobCount, cached }>
```

- Un jeton inconnu lève `not_found` depuis `readBoard`, et rend
  `exists: false` depuis `probeBoard`.
- Un board réel sans offre rend une liste vide et `exists: true`.
- Une charge qui n'est pas un board lève `parse_failure`.
- Une offre portant une valeur inconnue traverse la lecture.

`probeBoard` existe parce que la résolution pose une question à laquelle une
exception ne répond pas : un jeton inconnu et une entreprise entre deux
campagnes doivent rester distincts.

### `resolve.ts`

```ts
resolveBoard(name, reader): Promise<Resolution>
boardForms(name, most): string[]
```

- `boardForms` rend les formes dans l'ordre d'envoi, sans doublon, et au plus
  `most`.
- L'échelle s'arrête à la première forme qui répond.
- `tried` porte les formes réellement envoyées, et rien de plus.
- Un board qui ne publie rien est trouvé, avec `publishes: false`.
- Aucune trouvaille rend `found: []`, ce qui énonce un échec de résolution.

### `filter.ts`

```ts
applyCriteria(jobs, criteria): FilterResult
sortJobs(jobs, by): RawJob[]
```

- Un critère sur un champ nul ne retient pas l'offre, et l'incrémente dans
  `undeclared`, dont les clés portent le nom du champ au singulier :
  `department`, `team`, `country`, `workplace_type`, `is_remote`,
  `compensation`, `salary_comparison`.
- Une entreprise qui retient sa grille compte dans `compensation`. Une offre
  qui publie un salaire dans une autre devise ou sur une autre période compte
  dans `salary_comparison` : elle a publié un montant, et ce montant ne se
  compare pas.
- `salaryMin` compare à devise égale et à période égale. Une offre horaire
  n'est pas retenue par un seuil annuel.
- Une offre à plusieurs strates est retenue dès qu'une strate franchit le
  seuil.
- `country` compare à l'orthographe publiée, sans fusionner `USA` et
  `United States`.
- Une valeur de critère absente du board sort dans `unmatchedValues`, ce qui
  permet à l'outil de lever `invalid_input` avec les valeurs présentes.
- `sortJobs` est stable, et `title` trie sans tenir compte de la casse.

### `facets.ts`

```ts
countFacets(jobs, wanted): Facets
```

- Chaque facette compte les offres qui la déclarent.
- `undeclared` compte celles qui se taisent, par champ.
- `siblingSpellings` groupe les orthographes voisines d'un même board.
- Une facette non demandée est absente de la sortie, jamais rendue vide.

### `compensation.ts`

```ts
readPay(job): Pay
comparePay(jobs, component, interval): PayComparison
componentsOfType(job, type): PayComponent[]
```

- `shouldDisplayCompensationOnJobPostings: false` rend
  `{ published: false, summary: null, tiers: [] }`.
- Les composantes viennent de `compensationTiers[].components`, jamais de la
  liste aplatie.
- Une composante sans borne garde `min` et `max` à `null`.
- Un pourcentage de capital garde sa devise à `null`.
- `min` égal à `max` traverse sans devenir une fourchette.
- `comparePay` ne convertit rien, n'additionne rien entre types, ne calcule ni
  moyenne ni médiane, et nomme les offres sans grille dans `not_published`.

### `client.ts`

Le point d'entrée publié. Il compose les modules ci-dessus, et n'ajoute que :

- une lecture unique pour deux lectures concurrentes de la même adresse ;
- un cache de résolution tenu pour la session ;
- la revalidation par `If-None-Match` au-delà du TTL, un `304` conservant la
  charge en place et rendant `cached: true`.

## Ce que la couche des outils ajoute, et rien de plus

Les arguments, le rendu et les notes. Un outil ne calcule aucune donnée que la
couche basse ne rend pas, et ne corrige aucune valeur qu'Ashby publie.

Chaque outil déclare un `outputSchema`, et sa sortie le respecte. Là où la
forme dépend d'une branche, le schéma la déclare en union : la rémunération
publiée et la rémunération retenue ne portent pas les mêmes champs.
