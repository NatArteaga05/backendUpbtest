const { test } = require('node:test');
const assert = require('node:assert/strict');

// Sustituir la conexión antes de cargar el repositorio: ninguna prueba usa una BD real.
const consultas = [];
let filas = [];
require.cache[require.resolve('../src/config/db')] = {
    exports: {
        query: async (...args) => {
            consultas.push(args);
            return { rows: filas };
        },
    },
};
const controller = require('../src/controllers/producto.controller');

async function listar(nombre) {
    consultas.length = 0;
    let respuesta;
    await controller.listar({ query: nombre === undefined ? {} : { nombre } }, {
        json: (datos) => { respuesta = datos; },
    });
    return respuesta;
}

test('envía el filtro parcial sin distinguir mayúsculas como parámetro SQL', async () => {
    filas = [{ id: 1, nombre: 'Cuaderno', precio: '12.50', stock: 3, created_at: '2026-10-17' }];
    const productos = await listar('  CUADER  ');
    assert.match(consultas[0][0], /WHERE nombre ILIKE \$1/);
    assert.match(consultas[0][0], /ORDER BY id/);
    assert.deepEqual(consultas[0][1], ['%CUADER%']);
    assert.deepEqual(productos, [{ id: 1, nombre: 'Cuaderno', precio: 12.5, stock: 3, createdAt: '2026-10-17' }]);
});

test('sin filtro o con filtro vacío conserva el listado completo', async () => {
    filas = [];
    for (const nombre of [undefined, '', '   ']) {
        assert.deepEqual(await listar(nombre), []);
        assert.equal(consultas[0][0], 'SELECT * FROM productos ORDER BY id');
    }
});

test('sin coincidencias devuelve una lista vacía', async () => {
    filas = [];
    assert.deepEqual(await listar('inexistente'), []);
    assert.deepEqual(consultas[0][1], ['%inexistente%']);
});

test('rechaza filtros repetidos u objetos con un error 400', async () => {
    for (const nombre of [['uno', 'dos'], { texto: 'uno' }]) {
        await assert.rejects(listar(nombre), (error) => error.status === 400);
        assert.equal(consultas.length, 0);
    }
});

test('trata comodines como texto literal y no interpola entradas en SQL', async () => {
    filas = [];
    await listar("50%_\\' OR 1=1 --");
    assert.deepEqual(consultas[0][1], ["%50\\%\\_\\\\' OR 1=1 --%"]);
    assert.equal(consultas[0][0].includes('OR 1=1'), false);
});
