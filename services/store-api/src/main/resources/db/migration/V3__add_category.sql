-- Categories classify products across stores (a buyer browses "Calzado", not one shop).

CREATE TABLE category (
    id   bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL,
    slug text NOT NULL,
    CONSTRAINT uq_category_slug UNIQUE (slug)
);

INSERT INTO category (name, slug) VALUES
    ('Café y bebidas', 'cafe-y-bebidas'),
    ('Dulces y postres', 'dulces-y-postres'),
    ('Despensa', 'despensa'),
    ('Ropa y tejidos', 'ropa-y-tejidos'),
    ('Calzado', 'calzado'),
    ('Accesorios', 'accesorios'),
    ('Hogar y cocina', 'hogar-y-cocina');

-- Adding a NOT NULL column to a table that already has rows takes three steps:
-- 1) add it as nullable, 2) fill it for the existing rows, 3) only then forbid NULL.
ALTER TABLE product ADD COLUMN category_id bigint;

-- The seed product slugs of V2 are unique across stores, so the slug alone identifies the row.
UPDATE product p
SET category_id = c.id
FROM (VALUES
    ('cafe-molido-quindio-500g', 'cafe-y-bebidas'),
    ('cafe-en-grano-supremo-1kg', 'cafe-y-bebidas'),
    ('panela-organica-bloque-1kg', 'despensa'),
    ('prensa-francesa-600ml', 'hogar-y-cocina'),
    ('ruana-de-lana-virgen', 'ropa-y-tejidos'),
    ('mochila-tejida-a-mano', 'accesorios'),
    ('gorro-de-lana-nino', 'ropa-y-tejidos'),
    ('bufanda-de-alpaca', 'ropa-y-tejidos'),
    ('arequipe-artesanal-500g', 'dulces-y-postres'),
    ('bocadillo-veleno-x12', 'dulces-y-postres'),
    ('manjar-blanco-en-totuma', 'dulces-y-postres'),
    ('cocadas-surtidas-x6', 'dulces-y-postres')
) AS m (product_slug, category_slug)
JOIN category c ON c.slug = m.category_slug
WHERE p.slug = m.product_slug;

-- Fails here, and rolls the whole migration back, if any product was left without a category.
ALTER TABLE product ALTER COLUMN category_id SET NOT NULL;

ALTER TABLE product
    ADD CONSTRAINT fk_product_category FOREIGN KEY (category_id) REFERENCES category (id);

-- Supports the "products of a category" filter and the FK check when a category is deleted.
CREATE INDEX idx_product_category_id ON product (category_id);
