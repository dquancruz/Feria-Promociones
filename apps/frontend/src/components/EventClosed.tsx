export function EventClosed() {
  return (
    <section className="panel closed" aria-labelledby="closed-heading">
      <h2 id="closed-heading">El registro aún no está disponible</h2>
      <p>
        Por ahora no estamos recibiendo confirmaciones de asistencia. Vuelve a intentarlo más adelante, o llámanos y
        con gusto te ayudamos.
      </p>
      <p className="closed-phone">Atención al cliente: 2223-2425</p>
    </section>
  );
}
