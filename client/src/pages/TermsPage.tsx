import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Aufbewahrungspflichten & Nutzungsbedingungen</h1>

      <div className="prose prose-sm text-gray-700 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-gray-900">1. Aufbewahrungspflicht nach BAO</h2>
          <p>
            Gemäß <strong>§ 132 Abs. 1 BAO</strong> (Bundesabgabenordnung) sind Bücher und Aufzeichnungen sowie
            die zu den Büchern und Aufzeichnungen gehörigen Belege <strong>sieben Jahre</strong> aufzubewahren.
            Die Frist beginnt am Ende des Jahres, für das die letzte Eintragung vorgenommen wurde.
          </p>
          <p>
            Bei Grundstücken im Sinne des § 2 des Grunderwerbsteuergesetzes 1987 verlängert sich die Frist
            auf <strong>22 Jahre</strong> ab dem Zeitpunkt der Anschaffung oder Herstellung.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">2. Aufbewahrungsform</h2>
          <p>
            Die Aufbewahrung kann auch auf Datenträgern geschehen, wenn die vollständige, geordnete, inhaltsgleiche
            und urschriftgetreue Wiedergabe bis zum Ablauf der gesetzlichen Aufbewahrungsfrist jederzeit gewährleistet ist
            (§ 132 Abs. 2 BAO). Ki2Go Accounting speichert Ihre Belege verschlüsselt und revisionssicher.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">3. Verantwortung des Nutzers</h2>
          <p>
            Der Nutzer ist selbst dafür verantwortlich, dass alle steuerlich relevanten Belege vollständig
            und fristgerecht hochgeladen werden. Ki2Go Accounting ersetzt keine steuerliche Beratung.
            Wir empfehlen die regelmäßige Prüfung durch einen Steuerberater.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">4. Systemverfügbarkeit</h2>
          <p>
            Wir bemühen uns um eine hohe Verfügbarkeit des Systems, können jedoch keine unterbrechungsfreie
            Nutzung garantieren. Wartungsarbeiten werden nach Möglichkeit vorab angekündigt.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-gray-900">5. Kontolöschung</h2>
          <p>
            Sie können Ihr Konto jederzeit löschen. Bitte beachten Sie, dass die Löschung aller Daten
            unwiderruflich ist und Sie die gesetzliche Aufbewahrungspflicht eigenverantwortlich sicherstellen müssen.
            Exportieren Sie Ihre Daten vor der Löschung über die Einstellungen.
          </p>
        </section>
      </div>

      <div className="mt-8 border-t pt-4">
        <Link to="/" className="text-primary-600 hover:underline text-sm">Zurück zum Dashboard</Link>
      </div>
    </div>
  );
}
