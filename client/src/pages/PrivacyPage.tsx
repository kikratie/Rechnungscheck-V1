import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Datenschutzerklärung</h1>

      <div className="prose prose-sm text-gray-700 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-gray-900">1. Verantwortlicher</h2>
          <p>
            Verantwortlich für die Datenverarbeitung im Sinne der DSGVO ist der Betreiber dieser Anwendung.
            Kontaktdaten entnehmen Sie bitte dem Impressum.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">2. Welche Daten wir verarbeiten</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Registrierungsdaten (Name, E-Mail-Adresse)</li>
            <li>Firmendaten (Firmenname, UID-Nummer, Adresse)</li>
            <li>Hochgeladene Rechnungsbelege und extrahierte Rechnungsdaten</li>
            <li>Bankkontoauszüge und Transaktionsdaten</li>
            <li>Nutzungsdaten (Login-Zeiten, durchgeführte Aktionen via Audit-Log)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">3. Zweck der Verarbeitung</h2>
          <p>
            Die Verarbeitung erfolgt zur Erbringung unseres Buchhaltungs-Automatisierungsdienstes.
            Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung) sowie
            Art. 6 Abs. 1 lit. c DSGVO (gesetzliche Aufbewahrungspflichten nach § 132 BAO).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">4. KI-Verarbeitung</h2>
          <p>
            Hochgeladene Belege werden mittels KI (OpenAI GPT-4 Vision) verarbeitet, um Rechnungsdaten
            automatisch zu extrahieren. Die Daten werden ausschließlich zur Erbringung des Dienstes
            an den KI-Anbieter übermittelt und nicht für Trainingszwecke verwendet.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">5. Datenspeicherung</h2>
          <p>
            Ihre Daten werden auf Servern in der EU gespeichert. Belege und Dokumente werden
            verschlüsselt in einem S3-kompatiblen Objektspeicher abgelegt.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">6. Ihre Rechte</h2>
          <p>Sie haben folgende Rechte nach DSGVO:</p>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>Auskunft (Art. 15)</strong> — Welche Daten wir über Sie speichern</li>
            <li><strong>Berichtigung (Art. 16)</strong> — Korrektur unrichtiger Daten</li>
            <li><strong>Löschung (Art. 17)</strong> — Recht auf Vergessen (über Einstellungen → Konto löschen)</li>
            <li><strong>Datenübertragbarkeit (Art. 20)</strong> — Export Ihrer Daten (über Einstellungen → Daten exportieren)</li>
            <li><strong>Widerspruch (Art. 21)</strong> — Gegen die Verarbeitung Widerspruch einlegen</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">7. Cookies</h2>
          <p>
            Diese Anwendung verwendet keine Tracking-Cookies. Authentifizierungsdaten werden
            ausschließlich im localStorage des Browsers gespeichert.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">8. Kontakt</h2>
          <p>
            Bei Fragen zum Datenschutz wenden Sie sich bitte an den Betreiber dieser Anwendung.
          </p>
        </section>
      </div>

      <div className="mt-8 border-t pt-4">
        <Link to="/" className="text-primary-600 hover:underline text-sm">Zurück zum Dashboard</Link>
      </div>
    </div>
  );
}
