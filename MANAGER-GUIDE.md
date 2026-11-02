# Guía del gestor — actualizar la web sin tocar código

Todo se gestiona desde el panel, sin programar. Entra en
**propapropteu.com/acceso** con tu cuenta de gestor.

## Añadir o editar un producto
1. Pestaña **Productes** → **+ Nou producte** (o **Editar** en uno existente).
2. Rellena ID (minúsculas-con-guiones, único), tipo, **precio**, **stock**
   (vacío = sin límite), y los textos en los 3 idiomas (CA/ES/EN).
3. **Imágenes**: *+ Pujar imatge* sube la foto (va a Google Drive sola).
4. **Visible a la botiga**: desmárcalo para ocultar el producto del web sin
   borrarlo. **Destacat** lo pone en la portada y arriba en la tienda.
5. **Cost i materials** (interno, nunca sale al web): el coste calcula el
   beneficio; los materiales (PLA/PETG… + gramos) se descuentan del inventario
   en cada pedido.
6. **Guardar** → vuelve a la lista. **Duplicar** clona un producto parecido.
7. Pulsa **Publicar** (arriba) para que los cambios salgan en la web (~1-2 min).
   El aviso "Canvis sense publicar" te recuerda que falta publicar.

> También puedes publicar desde la hoja de cálculo: menú **Prop a Prop Teu →
> Publicar al web**.

## Cambiar solo precio o stock
Editar producto → cambia el campo → Guardar → **Publicar**.

## Pedidos (Comandes)
Ves los pedidos con cliente, artículos, **ingresos/coste/beneficio** y estado.
Cambia el estado (nou → pendent pagament → pagat → preparació → entregat),
descarga la **Factura** (PDF) o borra el pedido.

## Inventario (Materials)
Añade materiales (PLA, PETG, ABS… por color), con stock en gramos, €/gramo y
mínimo. Las filas por debajo del mínimo se marcan y avisan en el resumen de
pedidos. El stock baja solo con cada pedido según los materiales del producto.

## Mensajes (Missatges)
Consultas de los formularios de contacto y presupuesto: responde o borra.

## Datos que aún faltan (cuando los tengas)
- IBAN real en `js/config.js` (ahora es un marcador).
- Datos fiscales de las facturas: propiedades del script `FISCAL_NAME`,
  `FISCAL_NIF`, `FISCAL_ADDR`.
- Fotos reales de productos y del equipo.
