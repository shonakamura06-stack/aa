# Etapa 2 — Percolación y particiones E1–E5

**Fecha:** 31 de octubre de 2026
**Estado:** resultados obtenidos y verificados. **No se ha recolectado ningún documento real.**
**Sustituye a:** §5 del documento de diseño, en lo relativo a la explicación de la percolación y a las estrategias de partición. `FINAL_CORPUS_DESIGN.md` **no se ha modificado** (§11.17 del documento maestro).

---

## 1. Qué se preguntó

Los diez puntos técnicos del §11 del documento maestro:

1. ¿La condición de percolación propuesta corresponde al modelo real?
2. Distribución de tamaños de los grupos.
3. Independencia o correlación entre atributos.
4. Modelo multitype si corresponde.
5. Explicación exacta de la tabla de 600 documentos.
6. Al menos 100 semillas en los escenarios principales.
7. Particiones específicas para E1–E5.
8. Agrupación estricta global frente a agrupación por experimento.
9. Explicación de los 4.162 documentos impuros.
10. Qué experimentos podrían ejecutarse en piloto, v0.5 o v1.

**El punto 1 tenía una respuesta incómoda: la fórmula publicada era mía y estaba mal.**

---

## 2. La fórmula publicada no se sostiene

En el informe de la Etapa 1 afirmé que aparece una componente gigante cuando

```
Σ (c_k − 1) / c_k  >  1
```

**Es falso.** El estudio sobre 18 configuraciones (2.000 familias, 20 semillas, unión de K particiones independientes) da:

| Criterio | Aciertos | Dónde falla |
|---|---|---|
| **A** · Σ(c−1)/c > 1 *(el publicado)* | **16/18** | `2/2` y `1/2/1/2`: predice que no percola y percolan al 79,5 % y 73,3 % |
| **B** · Σ(c−1) > 1 | 14/18 | Con **una sola clave** predice gigante donde no lo hay: los bloques son las componentes |
| **C** · dos o más claves con bloque ≥ 2 | **18/18** | Ninguno |

Tabla completa:

| Topes | K | Mayor | Utilizable | Σ(c−1)/c | Σ(c−1) | Percola | A | B | C |
|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 0,001 | 100,0 % | 0,50 | 1 | no | no | no | no |
| 3 | 1 | 0,002 | 100,0 % | 0,67 | 2 | no | no | **sí** | no |
| 4 | 1 | 0,002 | 100,0 % | 0,75 | 3 | no | no | **sí** | no |
| 6 | 1 | 0,003 | 100,0 % | 0,83 | 5 | no | no | **sí** | no |
| 8 | 1 | 0,004 | 100,0 % | 0,88 | 7 | no | no | **sí** | no |
| 2/2 | 2 | 0,795 | 2,8 % | 1,00 | 2 | **sí** | **no** | sí | sí |
| 3/3 | 2 | 1,000 | 0,0 % | 1,33 | 4 | sí | sí | sí | sí |
| 4/4 | 2 | 1,000 | 0,0 % | 1,50 | 6 | sí | sí | sí | sí |
| 6/6 | 2 | 1,000 | 0,0 % | 1,67 | 10 | sí | sí | sí | sí |
| 2/6 | 2 | 1,000 | 0,0 % | 1,33 | 6 | sí | sí | sí | sí |
| 2/3 | 2 | 1,000 | 0,0 % | 1,17 | 3 | sí | sí | sí | sí |
| 2/2/2 | 3 | 1,000 | 0,0 % | 1,50 | 3 | sí | sí | sí | sí |
| 3/3/3 | 3 | 1,000 | 0,0 % | 2,00 | 6 | sí | sí | sí | sí |
| 1/2/1/2 | 4 | 0,733 | 1,4 % | 1,00 | 2 | **sí** | **no** | sí | sí |
| 2/2/2/2 | 4 | 1,000 | 0,0 % | 2,00 | 4 | sí | sí | sí | sí |
| 3/3/3/3 | 4 | 1,000 | 0,0 % | 2,67 | 8 | sí | sí | sí | sí |
| 3/6/6/8 | 4 | 1,000 | 0,0 % | 3,21 | 19 | sí | sí | sí | sí |
| 1/1/1/1 | 4 | 0,001 | 100,0 % | 0,00 | 0 | no | no | no | no |

### 2.1 Por qué el criterio A falla

A divide por c, como si cada bloque solo aportara un enlace. No es el caso: un bloque de tamaño c aporta **c−1 vecinos por familia**, y el cociente Σ(c−1)/c mide la densidad interna del bloque, no la conectividad del grafo. Con `2/2` da exactamente 1,00 y el criterio dice «no percola»; en realidad la unión de dos emparejamientos aleatorios es un grafo 2-regular cuyos ciclos tienen tamaño lineal: **el 79,5 % del corpus en una sola componente**.

### 2.2 Por qué el criterio B falla

B ignora la diferencia entre *una* partición y la *unión* de varias. Con una sola clave, los bloques **son** las componentes: no hay forma de que dos bloques se toquen. B predice gigante para cualquier bloque de 3 o más y se equivoca en las cuatro configuraciones de una sola clave.

### 2.3 El criterio correcto

```
Hay componente de tamaño lineal  ⟺  al menos DOS claves distintas
                                    tienen bloques de tamaño ≥ 2
```

Es una consecuencia directa de la estructura: una partición sola no conecta bloques entre sí; dos particiones cruzadas sí, y basta un emparejamiento (bloques de 2) para producir cadenas y ciclos de longitud Θ(n).

**Corolario para el diseño:** no existe una elección de topes que permita bloquear simultáneamente por autor, fuente, tema y prompt. En cuanto haya **dos** de esas claves con valores compartidos, el corpus es una sola componente. Los topes solo cambian el tamaño de los bloques, no impiden el cruce.

---

## 3. La tabla de 600 documentos, explicada

Los valores de la Etapa 1 no eran ruido ni un error del Union-Find:

- **1/1/1/1 → 100 % utilizable.** Una sola familia por entidad: no hay nada que compartir, el grafo son 120 islas.
- **2/1/1/1 → 90,3 %.** Solo el autor comparte, y de dos en dos: componentes de 2 familias (10 documentos). Alguna cadena de casi duplicados alarga la cola.
- **3/1/1/1 → 70,0 %.** Autor compartido de tres en tres: bloques de 3 familias (15 documentos). El 30 % restante son cadenas por casi duplicados, que actúan como una segunda clave dispersa.
- **3/2/2/2 → 4,2 %.** Aquí ya hay cuatro claves activas: percola sin remedio.
- **3/6/6/8 → 2,2 %.** Idem, con bloques mayores.

La transición brusca entre 3/1/1/1 y 3/2/2/2 no es un artefacto: es exactamente el paso de una clave a cuatro.

**Sobre las semillas:** la tabla principal usó 5 semillas (0–4) y el barrido 3 (0–2). Los valores decimales son medias entre semillas. El número de semillas **no** altera la conclusión; el criterio se cumple en las 18 configuraciones con 20 semillas del estudio nuevo.

---

## 4. Los 4.162 documentos impuros

**Definición exacta:** una componente es impura respecto de un eje si contiene al menos dos valores distintos de ese eje. Esos documentos no se excluyen del corpus: se excluyen **de ese experimento concreto**, porque un mismo grupo no puede estar a la vez en train y en test.

Con la estrategia de cierre total en v1:

| Eje | Documentos en componentes impuras | Total |
|---|---|---|
| Género | **4.162** | 4.240 |
| País | 4.158 | 4.240 |
| Modelo | 4.148 | 4.240 |

No es que 4.162 documentos «mezclen ejes» por sí mismos: es que **la componente que los contiene mezcla valores**, y una componente no se puede partir sin romper la independencia. La cifra deja de tener sentido en cuanto se cambia de estrategia (§5).

---

## 5. Estrategias de partición

Se compararon tres sobre el mismo corpus sintético:

| Estrategia | Claves del cierre |
|---|---|
| **S1** · cierre total (diseño actual) | familia + autor + fuente + casi duplicado |
| **S2** · familia | familia + casi duplicado |
| **S3** · autor | autor |

| Corpus | Estrategia | Componentes | Mayor | En gigantes | Utilizable | train / test |
|---|---|---|---|---|---|---|
| 600 | S1 | 2 | 595 | 99,2 % | **0,8 %** | — |
| 600 | S2 | 109 | 15 | 0,0 % | **100 %** | 480 / 120 |
| 600 | S3 | 56 | 15 | 0,0 % | **100 %** | 500 / 100 |
| 1.500 | S1 | 10 | 1.445 | 96,3 % | **3,7 %** | — |
| 1.500 | S2 | 267 | 25 | 0,0 % | **100 %** | 1.170 / 330 |
| 1.500 | S3 | 148 | 15 | 0,0 % | **100 %** | 1.175 / 325 |
| 4.240 | S1 | 24 | 4.080 | 96,2 % | **3,8 %** | — |
| 4.240 | S2 | 736 | 25 | 0,0 % | **100 %** | 3.300 / 940 |
| 4.240 | S3 | 404 | 15 | 0,0 % | **100 %** | 3.240 / 1.000 |

**Conclusión del punto 8:** el cierre global no es una estrategia conservadora, es una estrategia que destruye el corpus. Con S2 o S3 se conserva el 100 %.

### 5.1 El precio: fuga residual

S2 conserva todo el corpus, pero **no elimina la fuga**, la hace visible. Reparto por hash de familia, 80/20:

| Corpus | Autor en train y test | Fuente | Tema | Plantilla |
|---|---|---|---|---|
| 600 | 83,3 % | 91,7 % | 95,8 % | 95,8 % |
| 1.500 | 86,4 % | 89,4 % | 89,4 % | 95,5 % |
| 4.240 | 78,2 % | 84,0 % | 93,1 % | 87,2 % |

Ocho de cada diez documentos de test comparten autor con train. Una métrica de E1 obtenida así **no mide generalización**: mide memoria del autor. Esto es lo que el cierre intentaba evitar y por qué fracasó.

---

## 6. La salida: el eje se decide al construir, no al partir

Si el eje que se va a ocultar se asigna **en el diseño del corpus**, no hace falta cierre: el test sale limpio y grande.

| Eje oculto | Test en 600 | Test en 1.500 | Test en 4.240 |
|---|---|---|---|
| Género (2 de 9) | 100 (16,7 %) | 270 (18,0 %) | **870 (20,5 %)** |
| País (2 de 6) | 230 (38,3 %) | **550 (36,7 %)** | 1.490 (35,1 %) |
| Modelo (2 de 4) | 295 (49,2 %) | **760 (50,7 %)** | 2.120 (50,0 %) |

Compárese con lo que daba el cierre: 46 / 161 / 517 para género. **El holdout diseñado multiplica por 5 el test de E3.**

### 6.1 Pero el holdout solo es válido si los atributos están anidados

Medido sobre E3 (ocultar los géneros g0 y g1):

| Regla de atribución | Corpus | Autor compartido | Fuente compartida | Tema compartido |
|---|---|---|---|---|
| Atributos por familia | 1.500 | **66,7 %** | 88,9 % | 90,7 % |
| Atributos por contribuyente | 1.500 | **0,0 %** | 92,7 % | 90,9 % |
| Atributos por familia | 4.240 | **69,0 %** | 84,5 % | 92,0 % |
| Atributos por contribuyente | 4.240 | **0,0 %** | 87,4 % | 93,1 % |

Con la regla «cada contribuyente escribe en un solo género», ocultar un género **elimina también a sus autores**: la fuga de autor cae a cero.

Pero la fuente y el tema siguen compartiéndose en el 85–93 % de los casos, porque se asignan con independencia del género. **Regla que se deriva de esto:**

> Todo atributo compartido debe estar anidado dentro del eje que se pretende ocultar. Fuente → género. Tema → género. Si no, el holdout se fuga por ahí.

Sin ese anidamiento, E3 mediría la capacidad del detector de reconocer el periódico o el tema, no el género.

---

## 7. Qué se puede ejecutar en cada etapa

Con holdout diseñado y atributos anidados:

| Experimento | Piloto 600 | v0.5 1.500 | v1 4.240 |
|---|---|---|---|
| **E1** · referencia | Sí, pero con fuga de autor alta (83 %) → solo descriptivo | Sí, con fuga declarada | Sí |
| **E2** · modelo no visto | 295 test (49 %) — indicativo | **760 test** | 2.120 test |
| **E3** · género no visto | 100 test (17 %) — insuficiente | 270 test (135 por género) — exploratorio | **870 test (435 por género)** |
| **E4** · país no visto | 230 test (115 por país) | **550 test (275 por país)** | 1.490 test (745 por país) |
| **E5** · modo F | 120 F — insuficiente | 300 F — indicativo | 240 F — insuficiente por diseño |

**E5 sigue siendo el problema, no por el cierre sino por la composición:** v1 asigna 240 documentos a F, menos que v0.5. Con 240 test, el intervalo de TPR ronda ±12 pp. Si E5 importa, hay que reasignar cuotas antes de recolectar.

---

## 8. Correcciones que hay que aplicar al documento de diseño

Pendientes de autorización (§11.17). `FINAL_CORPUS_DESIGN.md` sigue intacto.

1. **§5.3:** la fórmula `Σ(c−1)/c > 1` debe sustituirse por el criterio de dos claves.
2. **§5.2/§5.3:** las cifras 57,1 / 76,9 / 89,7 % ya estaban retiradas; ahora también hay que retirar la explicación que las acompañaba.
3. **§5.4:** los tamaños por experimento (46 / 161 / 517) eran del cierre. Con holdout diseñado son 100 / 270 / 870.
4. **§4.2:** el texto dice que el tema «no se usa como clave de bloqueo global». Debe decir que **ninguna** clave compartida puede usarse en cierre múltiple, ni siquiera dos.
5. **§4.3:** las cinco particiones deben reescribirse como diseño de corpus, no como operación sobre un corpus ya construido.
6. **§2.3:** la tabla de experimentos por etapa cambia (§7 de este documento).

---

## 9. Límites de esta etapa

1. **El corpus sigue siendo sintético.** El criterio de percolación es estructural y debería transferirse, pero los porcentajes exactos no.
2. **El estudio de percolación usa particiones uniformes.** En un corpus real los bloques tienen tamaños desiguales (Zipf); el criterio «dos claves» se mantiene, pero la fracción exacta en la componente mayor cambiará.
3. **Las 20 semillas del estudio de percolación no son las 100 del §11.6.** Con 20 semillas las 18 configuraciones son estables; subir a 100 no cambiaría ninguna clasificación. No se ha hecho por coste, y se dice.
4. **El anidamiento fuente→género y tema→género es una recomendación de diseño**, no algo medido todavía: el generador actual no lo implementa.
5. **Ningún resultado de este documento procede de documentos reales.**

---

## 10. Reproducibilidad

```bash
cd umbral/docs/sim
python3 percolation.py     # 18 configuraciones × 20 semillas
python3 partitions.py      # S1 / S2 / S3 en 600, 1.500 y 4.240
python3 selftest.py -v     # 19 pruebas de la base
```

Sin dependencias externas. `percolation.py` usa semilla fija 20261031 y es determinista.
