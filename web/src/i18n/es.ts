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
    quantityLabel: 'Cantidad',
    addToCart: 'Agregar al carrito',
    adding: 'Agregando…',
    addedToCart: (quantity: number) =>
      quantity === 1
        ? 'Agregado. Tienes 1 unidad de este producto en el carrito.'
        : `Agregado. Tienes ${quantity} unidades de este producto en el carrito.`,
    viewCart: 'Ver carrito',
    soldOutHint: 'Este producto está agotado por ahora.',
    maxInCartHint: 'Ya tienes en el carrito todas las unidades que puedes pedir.',
    backToCatalog: 'Volver al catálogo',
    loading: 'Cargando producto…',
    notFoundTitle: 'Este producto no existe',
    notFoundHint: 'Puede que la tienda lo haya retirado o que el enlace esté mal escrito.',
  },

  cart: {
    title: 'Carrito',
    headerLink: 'Carrito',
    headerLinkLabel: (totalItems: number) =>
      totalItems === 1 ? 'Carrito, 1 unidad' : `Carrito, ${totalItems} unidades`,
    loading: 'Cargando carrito…',
    listLabel: 'Productos en el carrito',
    unitPrice: (price: string) => `${price} c/u`,
    quantityLabel: 'Cantidad',
    decrease: (name: string) => `Quitar una unidad de ${name}`,
    increase: (name: string) => `Agregar una unidad de ${name}`,
    remove: 'Eliminar',
    removeLabel: (name: string) => `Eliminar ${name} del carrito`,
    stockWarning: (available: number) =>
      available === 0
        ? 'Este producto se agotó. Elimínalo para poder continuar.'
        : available === 1
          ? 'Solo queda 1 unidad. Reduce la cantidad para poder continuar.'
          : `Solo quedan ${available} unidades. Reduce la cantidad para poder continuar.`,
    total: 'Total',
    checkout: 'Continuar con la compra',
    continueShopping: 'Seguir comprando',
    emptyTitle: 'Tu carrito está vacío',
    emptyHint: 'Agrega productos desde el catálogo y aparecerán aquí.',
  },

  checkout: {
    title: 'Finalizar compra',
    summaryTitle: 'Resumen del pedido',
    lineQuantity: (quantity: number) => `× ${quantity}`,
    emailLabel: 'Correo electrónico',
    emailHint:
      'Tienda de demostración: no se envían correos reales. Usa un correo de prueba; el mensaje de confirmación queda visible en una bandeja pública de demostración.',
    emailRequired: 'Escribe tu correo electrónico.',
    emailInvalid: 'Escribe un correo válido, por ejemplo nombre@correo.com.',
    submit: 'Crear pedido',
    submitting: 'Creando pedido…',
    stockProblem:
      'Algún producto ya no tiene suficientes unidades disponibles. Revisa tu carrito y ajusta las cantidades.',
    backToCart: 'Volver al carrito',
  },

  order: {
    title: 'Tu pedido',
    loading: 'Cargando pedido…',
    numberLabel: 'Número de pedido',
    statusLabel: 'Estado',
    status: {
      PENDING_PAYMENT: 'Pendiente de pago',
      PAID: 'Pagado',
      CANCELLED: 'Cancelado',
    },
    emailLabel: 'Correo electrónico',
    createdAtLabel: 'Fecha',
    itemsTitle: 'Productos',
    // No final period: the time already ends in "a. m." or "p. m.".
    reservedUntil: (date: string) => `Tus productos están reservados hasta el ${date}`,
    payment: {
      title: 'Pago',
      payNow: 'Pagar ahora',
      simulateDeclined: 'Simular pago rechazado',
      simulatedNote:
        'Esta es una pasarela de pagos simulada: no se mueve dinero real. El segundo botón existe solo para probar qué pasa cuando un pago es rechazado.',
      processing: 'Procesando el pago…',
      stillWaiting: 'El resultado está tardando más de lo normal.',
      checkAgain: 'Consultar de nuevo',
      notPending: 'Este pedido ya no está pendiente de pago.',
      unavailable: 'El servicio de pagos no está disponible. Inténtalo de nuevo en un momento.',
      paidTitle: 'Pago aprobado',
      paidHint: (email: string) => `Enviaremos la confirmación del pedido a ${email}.`,
      cancelledTitle: 'Pedido cancelado',
      cancelledHint:
        'El pago fue rechazado o se venció el tiempo para pagar. Las unidades reservadas quedaron disponibles de nuevo.',
    },
    notFoundTitle: 'Este pedido no existe',
    notFoundHint: 'Revisa que el enlace esté completo y bien escrito.',
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
