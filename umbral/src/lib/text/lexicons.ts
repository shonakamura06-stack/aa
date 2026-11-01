/**
 * Léxicos de referencia. Son listas cerradas (palabras funcionales y
 * conectores) verificables, no modelos entrenados. Se declaran como tales.
 */

/** Palabras funcionales del español (clase cerrada). ~180 entradas. */
export const ES_FUNCTION_WORDS: string[] = [
  "el","la","los","las","un","una","unos","unas","lo","al","del",
  "de","a","en","con","por","para","sin","sobre","entre","hasta","desde","hacia","según","contra","durante","mediante","tras","ante","bajo","cabe","sobre",
  "y","e","o","u","pero","sino","que","si","como","cuando","mientras","porque","pues","ya","ni","aunque",
  "me","te","se","nos","os","le","les","mí","ti","sí","conmigo","contigo","nosotros","vosotros","ellos","ellas","él","ella",
  "mi","mis","tu","tus","su","sus","nuestro","nuestra","nuestros","nuestras","vuestro","vuestra","vuestros","vuestras",
  "este","esta","estos","estas","ese","esa","esos","esas","aquel","aquella","aquellos","aquellas","esto","eso","aquello",
  "quien","quienes","cual","cuales","cuyo","cuya","cuyos","cuyas","donde","adonde",
  "muy","más","menos","tan","tanto","tanta","tantos","tantas","poco","poca","pocos","pocas","mucho","mucha","muchos","muchas","todo","toda","todos","todas","otro","otra","otros","otras","algún","alguna","algunos","algunas","ningún","ninguna","ningunos","ningunas","cada","cualquier","cualquiera",
  "ser","es","son","era","eran","fue","fueron","sido","siendo","estar","está","están","estaba","estaban","estuvo","estuvieron","estado","estando",
  "haber","he","has","ha","hemos","habéis","han","había","habían","hubo","hubieron","habido",
  "tener","tiene","tienen","tenía","tenían","tuvo","tuvieron",
  "hacer","hace","hacen","hacía","hizo","hicieron",
  "no","sí","también","tampoco","solo","sólo","aún","aun","así","bien","mal","aquí","allí","allá","ahí","ahora","antes","después","luego","siempre","nunca","jamás","ya","todavía","casi","bastante","demasiado",
  "hay","habrá","habría","sea","sean","fuera","fuese","fueran","sería","serían","estaría","estarían",
  "qué","quién","cuál","cómo","cuándo","dónde","cuánto","cuánta","cuántos","cuántas",
  "os","eh","pues","verdad","cierto"
];

/** Palabras funcionales del inglés (clase cerrada). */
export const EN_FUNCTION_WORDS: string[] = [
  "the","of","and","to","in","a","an","is","are","was","were","be","been","being","am",
  "that","this","these","those","it","its","they","them","their","he","she","his","her","him","we","us","our","you","your","i","my","me",
  "for","with","by","on","at","from","as","about","into","through","during","before","after","above","below","between","under","over",
  "not","no","nor","or","but","if","then","than","so","because","while","when","where","which","who","whom","whose","what","how","why",
  "can","could","will","would","shall","should","may","might","must","do","does","did","done","have","has","had","having",
  "there","here","also","very","more","most","much","many","some","any","all","both","each","other","another","such","only","just","even","still","yet","again","further","once"
];

/** Conectores discursivos del español, agrupados por función retórica. */
export const ES_CONNECTORS: Record<string, string[]> = {
  adición: ["además","asimismo","también","igualmente","incluso","por añadidura","de igual modo","de igual manera","sumado a esto","aunado a"],
  contraste: ["sin embargo","no obstante","por el contrario","en cambio","ahora bien","si bien","aunque","pero","sino que","por otro lado","en contraste","a diferencia de"],
  causa: ["porque","ya que","puesto que","dado que","debido a que","en tanto que","a causa de","gracias a que","en vista de que"],
  consecuencia: ["por lo tanto","por consiguiente","en consecuencia","así pues","de modo que","de manera que","por ende","como resultado","en tal sentido"],
  ejemplificación: ["por ejemplo","verbigracia","así como","tal como","como muestra","a saber","en particular","concretamente","es decir","esto es","en otras palabras"],
  orden: ["en primer lugar","en segundo lugar","en tercer lugar","por último","finalmente","a continuación","seguidamente","para empezar","antes de todo","luego","después"],
  conclusión: ["en conclusión","en resumen","en síntesis","para concluir","en definitiva","resumiendo","en último término","a modo de cierre"],
  finalidad: ["a fin de que","con el objetivo de","con la finalidad de","para que","de manera que"],
  condición: ["siempre que","a menos que","en caso de que","a condición de que","suponiendo que"],
  temporal: ["mientras tanto","al mismo tiempo","posteriormente","previamente","en la actualidad","hoy en día"]
};

/** Conectores del inglés por función (para el modo inglés). */
export const EN_CONNECTORS: Record<string, string[]> = {
  addition: ["moreover","furthermore","in addition","also","likewise","similarly","besides"],
  contrast: ["however","nevertheless","nonetheless","on the contrary","in contrast","although","whereas","yet","by contrast"],
  cause: ["because","since","as","due to","owing to","given that"],
  consequence: ["therefore","thus","consequently","as a result","hence","accordingly"],
  exemplification: ["for example","for instance","such as","namely","in particular","that is"],
  order: ["first","second","third","finally","next","then","to begin with","subsequently"],
  conclusion: ["in conclusion","in summary","to sum up","overall","in short"],
};

/** Marcadores de subordinación (medida superficial, no árbol sintáctico). */
export const ES_SUBORDINATORS: string[] = [
  "que","porque","aunque","si","cuando","mientras","como","donde","quien","quienes","cual","cuales","cuyo","cuya",
  "puesto que","ya que","dado que","a fin de que","para que","siempre que","a menos que","en caso de que","tan pronto como","antes de que","después de que","sin que","con tal de que","de modo que","de manera que"
];

export const EN_SUBORDINATORS: string[] = [
  "that","because","although","though","if","when","while","where","which","who","whom","whose","since","unless","until","whereas","so that","in order that","even though","as long as"
];

/** Expresiones genéricas típicas de texto poco anclado (módulo editorial). */
export const GENERIC_PHRASES: string[] = [
  "en el mundo actual","en la sociedad actual","en la era digital","es importante destacar","es importante señalar","cabe destacar","cabe mencionar","sin duda alguna","sin lugar a dudas","en definitiva","en resumen","por otra parte","por otro lado","en este sentido","de alguna manera","de cierta forma","juega un papel crucial","juega un papel fundamental","es fundamental","resulta esencial","un tema de gran relevancia","cada vez más","una amplia gama","una serie de factores","diversos aspectos","en términos generales","a lo largo de la historia","desde tiempos inmemoriales","como todos sabemos","es bien sabido que","hoy en día"
];

/** Verbos en pasado de alta frecuencia: señal débil de narrativa. */
export const ES_NARRATIVE_MARKERS: string[] = [
  "dijo","dije","fue","eran","estaba","estaban","llegó","llegaron","miró","miraron","pensó","pensaba","recordó","volvió","salió","entró","tomó","empezó","comenzó","respondió","preguntó","contó","escribió","vivía","había","tenía","sabía","quería","podía"
];

export const ES_ACADEMIC_MARKERS: string[] = [
  "hipótesis","metodología","objetivo","resultados","discusión","conclusión","conclusiones","análisis","variable","muestra","datos","evidencia","bibliografía","referencias","estudio","investigación","marco teórico","corpus","significativo","correlación","porcentaje","índice","según","autores","literatura","enfoque","método","cuantitativo","cualitativo"
];

export const EN_ACADEMIC_MARKERS: string[] = [
  "hypothesis","methodology","objective","results","discussion","conclusion","analysis","variable","sample","data","evidence","bibliography","references","study","research","theoretical framework","corpus","significant","correlation","percentage","index","according to","literature","approach","quantitative","qualitative"
];

export const toSet = (items: string[]): Set<string> => new Set(items.map((w) => w.toLowerCase()));
