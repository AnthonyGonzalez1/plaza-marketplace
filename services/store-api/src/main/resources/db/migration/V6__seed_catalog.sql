-- Grows the demo catalog to 60 products in 4 stores and 7 categories, with stock.
-- A few products have 0 units (shown as sold out) and one has exactly 1 unit, which later
-- sessions use to demonstrate that two buyers cannot both buy the last unit.

INSERT INTO store (name, slug, description) VALUES
    ('Calzado El Caminante', 'calzado-el-caminante',
     'Zapatos y marroquinería en cuero hechos por artesanos de Bucaramanga.');

-- The new products are loaded into a temporary table first because two tables are filled from
-- the same list: product, and then inventory (which needs the generated product ids).
-- days_ago spreads the publication dates so the "newest" sort has something to order.
CREATE TEMPORARY TABLE seed_product (
    store_slug    text,
    category_slug text,
    name          text,
    slug          text,
    description   text,
    price         numeric(12, 2),
    available     int,
    days_ago      int
) ON COMMIT DROP;

INSERT INTO seed_product VALUES
    -- Café La Palma
    ('cafe-la-palma', 'cafe-y-bebidas', 'Café instantáneo liofilizado 100 g', 'cafe-instantaneo-liofilizado-100g',
     'Café soluble liofilizado, listo en segundos con agua caliente.', 18500.00, 40, 1),
    ('cafe-la-palma', 'cafe-y-bebidas', 'Café descafeinado molido 340 g', 'cafe-descafeinado-molido-340g',
     'Todo el sabor del café del Quindío sin cafeína, molienda media.', 27000.00, 18, 5),
    ('cafe-la-palma', 'cafe-y-bebidas', 'Café tostado origen Huila 250 g', 'cafe-tostado-origen-huila-250g',
     'Café de altura con notas frutales, tostado en lotes pequeños.', 24000.00, 25, 9),
    ('cafe-la-palma', 'cafe-y-bebidas', 'Chocolate de mesa con clavos y canela 500 g', 'chocolate-de-mesa-clavos-canela-500g',
     'Pastillas de chocolate para preparar en olleta, con especias.', 11500.00, 60, 13),
    ('cafe-la-palma', 'cafe-y-bebidas', 'Aromática de frutas deshidratadas x 20', 'aromatica-frutas-deshidratadas-x20',
     'Bolsitas de frutos rojos y manzana para infusión caliente o fría.', 9800.00, 35, 17),
    ('cafe-la-palma', 'despensa', 'Miel de abejas pura 500 g', 'miel-de-abejas-pura-500g',
     'Miel multifloral de apiarios del Eje Cafetero, sin azúcar añadida.', 26000.00, 22, 21),
    ('cafe-la-palma', 'hogar-y-cocina', 'Molinillo manual de café', 'molinillo-manual-de-cafe',
     'Molino de muelas cerámicas con ajuste de molienda fina o gruesa.', 89000.00, 8, 25),
    ('cafe-la-palma', 'hogar-y-cocina', 'Chocolatera de aluminio con molinillo', 'chocolatera-aluminio-con-molinillo',
     'Olleta tradicional de un litro con molinillo de madera para batir.', 42000.00, 14, 29),
    ('cafe-la-palma', 'hogar-y-cocina', 'Juego de 4 pocillos de cerámica', 'juego-4-pocillos-ceramica',
     'Pocillos tinteros esmaltados a mano en Ráquira.', 54000.00, 10, 33),
    ('cafe-la-palma', 'hogar-y-cocina', 'Colador de tela para café', 'colador-de-tela-para-cafe',
     'Filtro de tela reutilizable con aro metálico, como el de la abuela.', 7500.00, 50, 37),
    ('cafe-la-palma', 'hogar-y-cocina', 'Cafetera italiana moka 6 tazas', 'cafetera-italiana-moka-6-tazas',
     'Greca de aluminio para estufa de gas o eléctrica.', 68000.00, 0, 41),

    -- Tejidos Doña Rosa
    ('tejidos-dona-rosa', 'ropa-y-tejidos', 'Saco de lana tejido a mano', 'saco-de-lana-tejido-a-mano',
     'Saco grueso de lana de oveja con botones de madera.', 145000.00, 6, 2),
    ('tejidos-dona-rosa', 'ropa-y-tejidos', 'Guantes de lana de oveja', 'guantes-de-lana-de-oveja',
     'Guantes abrigados para clima frío, tejidos en dos agujas.', 32000.00, 30, 6),
    ('tejidos-dona-rosa', 'ropa-y-tejidos', 'Poncho de algodón liviano', 'poncho-de-algodon-liviano',
     'Poncho fresco para tierra caliente con flecos anudados.', 98000.00, 12, 10),
    ('tejidos-dona-rosa', 'ropa-y-tejidos', 'Medias térmicas de lana', 'medias-termicas-de-lana',
     'Medias gruesas para páramo, talla única adulto.', 22000.00, 45, 14),
    ('tejidos-dona-rosa', 'hogar-y-cocina', 'Cobija de lana matrimonial', 'cobija-de-lana-matrimonial',
     'Cobija pesada de lana virgen para cama doble.', 210000.00, 4, 18),
    ('tejidos-dona-rosa', 'hogar-y-cocina', 'Hamaca de algodón San Jacinto', 'hamaca-de-algodon-san-jacinto',
     'Hamaca tejida en telar vertical con colores vivos.', 195000.00, 7, 22),
    ('tejidos-dona-rosa', 'hogar-y-cocina', 'Individuales tejidos en fique x 4', 'individuales-tejidos-en-fique-x4',
     'Juego de cuatro individuales redondos para la mesa.', 48000.00, 16, 26),
    ('tejidos-dona-rosa', 'hogar-y-cocina', 'Canasto de werregue pequeño', 'canasto-de-werregue-pequeno',
     'Pieza única tejida en fibra de palma por artesanas del Chocó.', 230000.00, 1, 30),
    ('tejidos-dona-rosa', 'hogar-y-cocina', 'Cojín bordado a mano', 'cojin-bordado-a-mano',
     'Funda de cojín con flores bordadas en hilo de algodón.', 56000.00, 9, 34),
    ('tejidos-dona-rosa', 'accesorios', 'Mochila wayuu unicolor', 'mochila-wayuu-unicolor',
     'Mochila tejida en crochet por artesanas de La Guajira.', 160000.00, 5, 38),
    ('tejidos-dona-rosa', 'accesorios', 'Sombrero vueltiao 19 vueltas', 'sombrero-vueltiao-19-vueltas',
     'Sombrero de caña flecha trenzado a mano en Tuchín.', 175000.00, 0, 42),
    ('tejidos-dona-rosa', 'accesorios', 'Sombrero aguadeño', 'sombrero-aguadeno',
     'Sombrero de palma de iraca de ala corta, típico de Caldas.', 135000.00, 11, 45),
    ('tejidos-dona-rosa', 'accesorios', 'Manilla tejida en hilo', 'manilla-tejida-en-hilo',
     'Pulsera ajustable con los colores de la bandera.', 12000.00, 80, 47),

    -- Dulces del Valle
    ('dulces-del-valle', 'dulces-y-postres', 'Panelitas de leche x 12', 'panelitas-de-leche-x12',
     'Dulces blandos de leche y panela cortados en cuadritos.', 10500.00, 55, 3),
    ('dulces-del-valle', 'dulces-y-postres', 'Brevas con arequipe 450 g', 'brevas-con-arequipe-450g',
     'Brevas en almíbar rellenas de arequipe, postre de diciembre.', 19500.00, 20, 7),
    ('dulces-del-valle', 'dulces-y-postres', 'Obleas con arequipe x 10', 'obleas-con-arequipe-x10',
     'Obleas grandes listas para rellenar, incluye arequipe.', 15000.00, 28, 11),
    ('dulces-del-valle', 'dulces-y-postres', 'Gelatina de pata x 10', 'gelatina-de-pata-x10',
     'Gelatina blanca y negra tradicional, empacada por unidad.', 9000.00, 33, 15),
    ('dulces-del-valle', 'dulces-y-postres', 'Dulce de guayaba en casco 500 g', 'dulce-de-guayaba-en-casco-500g',
     'Cascos de guayaba en almíbar para acompañar con queso.', 13500.00, 24, 19),
    ('dulces-del-valle', 'dulces-y-postres', 'Turrón de maní con panela x 8', 'turron-de-mani-con-panela-x8',
     'Barras crocantes de maní tostado y melao de panela.', 9500.00, 38, 23),
    ('dulces-del-valle', 'dulces-y-postres', 'Chocolatinas de cacao 70 % x 6', 'chocolatinas-de-cacao-70-x6',
     'Chocolate oscuro de cacao fino de aroma de Tumaco.', 21000.00, 26, 27),
    ('dulces-del-valle', 'dulces-y-postres', 'Ancheta de dulces típicos', 'ancheta-de-dulces-tipicos',
     'Canasta de regalo con arequipe, bocadillo, cocadas y panelitas.', 68000.00, 0, 31),
    ('dulces-del-valle', 'despensa', 'Achiras del Huila 250 g', 'achiras-del-huila-250g',
     'Bizcochos horneados de almidón de achira y cuajada.', 8500.00, 42, 35),
    ('dulces-del-valle', 'despensa', 'Pandeyucas congelados x 12', 'pandeyucas-congelados-x12',
     'Listos para hornear, con queso costeño y almidón de yuca.', 14500.00, 15, 39),
    ('dulces-del-valle', 'despensa', 'Mermelada de mora artesanal 300 g', 'mermelada-de-mora-artesanal-300g',
     'Mermelada de mora de Castilla con trozos de fruta.', 12500.00, 31, 43),
    ('dulces-del-valle', 'despensa', 'Ají casero picante 250 ml', 'aji-casero-picante-250ml',
     'Salsa de ají con cebolla larga, cilantro y limón.', 9900.00, 27, 46),

    -- Calzado El Caminante
    ('calzado-el-caminante', 'calzado', 'Zapato formal de cuero negro', 'zapato-formal-de-cuero-negro',
     'Zapato de amarrar para hombre con suela cosida.', 189000.00, 12, 4),
    ('calzado-el-caminante', 'calzado', 'Zapato casual de gamuza', 'zapato-casual-de-gamuza',
     'Calzado cómodo para el día a día con plantilla acolchada.', 165000.00, 9, 8),
    ('calzado-el-caminante', 'calzado', 'Botas de cuero para trabajo', 'botas-de-cuero-para-trabajo',
     'Botas resistentes con puntera reforzada y suela antideslizante.', 220000.00, 7, 12),
    ('calzado-el-caminante', 'calzado', 'Botines de cuero para mujer', 'botines-de-cuero-para-mujer',
     'Botines de tacón bajo con cierre lateral.', 198000.00, 6, 16),
    ('calzado-el-caminante', 'calzado', 'Mocasines de cuero café', 'mocasines-de-cuero-cafe',
     'Mocasines sin cordones en cuero de color café oscuro.', 175000.00, 10, 20),
    ('calzado-el-caminante', 'calzado', 'Sandalias de cuero para mujer', 'sandalias-de-cuero-para-mujer',
     'Sandalias planas con correas trenzadas a mano.', 98000.00, 14, 24),
    ('calzado-el-caminante', 'calzado', 'Alpargatas de fique tradicionales', 'alpargatas-de-fique-tradicionales',
     'Calzado campesino con suela de fique y capellada de algodón.', 45000.00, 25, 28),
    ('calzado-el-caminante', 'calzado', 'Tenis de lona blancos', 'tenis-de-lona-blancos',
     'Tenis livianos con suela de caucho vulcanizado.', 110000.00, 18, 32),
    ('calzado-el-caminante', 'calzado', 'Betún y cepillo para calzado', 'betun-y-cepillo-para-calzado',
     'Kit de limpieza para mantener los zapatos de cuero brillantes.', 18000.00, 40, 36),
    ('calzado-el-caminante', 'accesorios', 'Cinturón de cuero trenzado', 'cinturon-de-cuero-trenzado',
     'Correa trenzada con hebilla metálica, ajustable a cualquier talla.', 62000.00, 20, 40),
    ('calzado-el-caminante', 'accesorios', 'Billetera de cuero para hombre', 'billetera-de-cuero-para-hombre',
     'Billetera de tres cuerpos con monedero y tarjetero.', 78000.00, 17, 44),
    ('calzado-el-caminante', 'accesorios', 'Bolso carriel antioqueño', 'bolso-carriel-antioqueno',
     'Carriel tradicional de cuero con bolsillos secretos.', 240000.00, 3, 48);

INSERT INTO product (store_id, category_id, name, slug, description, price, created_at)
SELECT s.id, c.id, sp.name, sp.slug, sp.description, sp.price,
       now() - make_interval(days => sp.days_ago)
FROM seed_product sp
JOIN store s ON s.slug = sp.store_slug
JOIN category c ON c.slug = sp.category_slug
ORDER BY sp.days_ago DESC;

INSERT INTO inventory (product_id, available)
SELECT p.id, sp.available
FROM seed_product sp
JOIN store s ON s.slug = sp.store_slug
JOIN product p ON p.store_id = s.id AND p.slug = sp.slug;
