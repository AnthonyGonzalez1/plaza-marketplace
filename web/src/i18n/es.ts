// Every piece of text the user can read lives here, in Spanish (Colombia).
// Components import `es` instead of hard-coding strings, so the wording is easy to review.
export const es = {
  brand: 'Plaza',
  tagline: 'El mercado de los pequeños comercios',
  skipToContent: 'Saltar al contenido',
  homeLink: 'Plaza, ir al catálogo',

  catalog: {
    title: 'Catálogo',
    intro: 'Productos de tiendas locales, en un solo lugar.',
    filtersLabel: 'Buscar y filtrar productos',
    searchLabel: 'Buscar',
    searchPlaceholder: 'Café, mochila, arequipe…',
    searchButton: 'Buscar',
    storeLabel: 'Tienda',
    allStores: 'Todas las tiendas',
    categoryLabel: 'Categoría',
    allCategories: 'Todas las categorías',
    minPriceLabel: 'Precio mínimo',
    maxPriceLabel: 'Precio máximo',
    sortLabel: 'Ordenar por',
    sortOptions: {
      relevance: 'Relevancia',
      price_asc: 'Precio: menor a mayor',
      price_desc: 'Precio: mayor a menor',
      newest: 'Más recientes',
    },
    clearFilters: 'Limpiar filtros',
    loading: 'Cargando productos…',
    resultCount: (total: number) =>
      total === 1 ? '1 producto' : `${total.toLocaleString('es-CO')} productos`,
    emptyTitle: 'No encontramos productos',
    emptyHint: 'Prueba con otra búsqueda o quita algunos filtros.',
  },

  pagination: {
    label: 'Paginación',
    previous: 'Anterior',
    next: 'Siguiente',
    status: (page: number, totalPages: number) => `Página ${page} de ${totalPages}`,
  },

  product: {
    soldOut: 'Agotado',
    lastUnit: 'Última unidad',
    inStock: (available: number) => `${available} disponibles`,
    soldBy: 'Vendido por',
    description: 'Descripción',
    addToCart: 'Agregar al carrito',
    comingSoon: 'Próximamente: el carrito llegará en una próxima versión.',
    backToCatalog: 'Volver al catálogo',
    loading: 'Cargando producto…',
    notFoundTitle: 'Este producto no existe',
    notFoundHint: 'Puede que la tienda lo haya retirado o que el enlace esté mal escrito.',
  },

  errors: {
    title: 'Algo salió mal',
    generic: 'No pudimos cargar la información. Revisa tu conexión e inténtalo de nuevo.',
    retry: 'Reintentar',
  },

  notFound: {
    title: 'Página no encontrada',
    hint: 'La dirección que abriste no existe en Plaza.',
    goHome: 'Ir al catálogo',
  },

  footer: {
    linksLabel: 'Enlaces del proyecto',
    note: 'Proyecto de portafolio: las tiendas, los productos y los pagos son simulados.',
    sourceCode: 'Código en GitHub',
    apiDocs: 'Documentación de la API',
  },
};
