import { Link } from 'react-router-dom';

export function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Allgemeine Nutzungsbedingungen & Haftungsausschluss</h1>
      <p className="text-sm text-gray-500 mb-6">Stand: Februar 2026 | Ki2Go Accounting, ein Produkt der ProAgentur GmbH</p>

      <div className="prose prose-sm text-gray-700 space-y-6">

        {/* 1. Geltungsbereich */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">1. Geltungsbereich & Vertragsgegenstand</h2>
          <p>
            Ki2Go Accounting (nachfolgend &bdquo;Plattform&ldquo;) ist ein <strong>Software-Werkzeug zur
            Unterstützung der Buchhaltung</strong>. Die Plattform bietet KI-gestützte Belegerfassung, automatisierte
            Prüfungen und Exportfunktionen. Durch die Registrierung und Nutzung akzeptiert der Nutzer
            (nachfolgend &bdquo;Kunde&ldquo;) diese Nutzungsbedingungen vollumfänglich.
          </p>
        </section>

        {/* 2. Keine Steuerberatung */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">2. Keine Steuer- oder Rechtsberatung</h2>
          <p>
            Die Plattform stellt <strong>ausdrücklich keine steuerliche, rechtliche oder wirtschaftliche
            Beratung</strong> dar. Sämtliche Prüfungen, Validierungen, Hinweise und Empfehlungen der Plattform
            (einschließlich der KI-gestützten Analyse) dienen ausschließlich der <strong>Unterstützung und
            Vorprüfung</strong> und ersetzen in keiner Weise die Prüfung durch einen Steuerberater,
            Wirtschaftsprüfer oder sonstigen fachkundigen Berater.
          </p>
          <p>
            Der Kunde ist verpflichtet, alle durch die Plattform erzeugten Ergebnisse eigenverantwortlich
            auf Richtigkeit und Vollständigkeit zu prüfen oder durch einen qualifizierten Fachberater
            prüfen zu lassen. Insbesondere sind alle automatisiert erstellten Buchungsvorschläge, Kontozuordnungen
            und Steuerberechnungen vom Kunden oder seinem Steuerberater vor Verwendung freizugeben.
          </p>
        </section>

        {/* 3. KI & Automatisierung */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">3. KI-gestützte Verarbeitung — Keine Gewähr</h2>
          <p>
            Die Plattform verwendet <strong>Künstliche Intelligenz (KI)</strong> für die Belegerfassung (OCR),
            Datenextraktion und Prüfung. Trotz hoher Erkennungsraten kann die KI <strong>fehlerhaft arbeiten</strong>.
            Insbesondere können folgende Fehler auftreten:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Falsche oder unvollständige Extraktion von Rechnungsdaten (Beträge, Daten, UID-Nummern)</li>
            <li>Fehlerhafte Kategorisierung oder Kontozuordnung</li>
            <li>Falsche Bewertung der Rechnungskonformität (§ 11 UStG)</li>
            <li>Fehler beim Zahlungsabgleich (Matching von Rechnungen und Banktransaktionen)</li>
          </ul>
          <p>
            <strong>Für die Richtigkeit der KI-Ergebnisse wird ausdrücklich keine Gewähr übernommen.</strong> Die
            Ampel-Anzeigen (Grün/Gelb/Rot) und Validierungsergebnisse sind Hinweise, keine rechtsverbindlichen
            Aussagen.
          </p>
        </section>

        {/* 4. Eigenverantwortung */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">4. Eigenverantwortung des Kunden</h2>
          <p>
            Der Kunde trägt die <strong>alleinige Verantwortung</strong> für:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Die Vollständigkeit und Richtigkeit aller hochgeladenen Belege und Daten</li>
            <li>Die Prüfung und Freigabe sämtlicher von der Plattform erzeugter Ergebnisse vor deren Verwendung</li>
            <li>Die ordnungsgemäße steuerliche Behandlung aller Geschäftsvorfälle</li>
            <li>Die fristgerechte Erfüllung aller steuerlichen Pflichten gegenüber dem Finanzamt</li>
            <li>Die Einhaltung aller geltenden gesetzlichen Vorschriften (UStG, BAO, EStG, etc.)</li>
          </ul>
        </section>

        {/* 5. Aufbewahrungspflicht */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">5. Aufbewahrungspflicht & Archivierung</h2>
          <p>
            Gemäß <strong>§ 132 Abs. 1 BAO</strong> sind Bücher, Aufzeichnungen und Belege <strong>sieben
            Jahre</strong> aufzubewahren. Bei Grundstücken verlängert sich die Frist auf <strong>22 Jahre</strong>.
          </p>
          <p className="bg-yellow-50 border-l-4 border-yellow-400 p-3 rounded">
            <strong>Wichtig:</strong> Die Plattform dient als Arbeitswerkzeug und ist <strong>kein zertifiziertes
            Langzeitarchiv</strong>. Der Kunde ist verpflichtet, alle steuerlich relevanten Belege und Exporte
            <strong> eigenständig auf eigenen Systemen oder Datenträgern zu archivieren</strong> und die
            gesetzliche Aufbewahrungspflicht unabhängig von der Plattform sicherzustellen. Die alleinige Speicherung
            auf der Plattform genügt nicht, um die gesetzliche Aufbewahrungspflicht zu erfüllen.
          </p>
          <p>
            Der Kunde hat sicherzustellen, dass eine vollständige, geordnete, inhaltsgleiche und
            urschriftgetreue Wiedergabe der Belege bis zum Ablauf der gesetzlichen Aufbewahrungsfrist
            jederzeit gewährleistet ist (§ 132 Abs. 2 BAO). Wir empfehlen den regelmäßigen Export
            und die Sicherung auf lokalen Datenträgern.
          </p>
        </section>

        {/* 6. Haftungsausschluss */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">6. Haftungsbeschränkung</h2>
          <p>
            <strong>6.1</strong> Die Nutzung der Plattform erfolgt auf <strong>eigene Gefahr und Verantwortung</strong> des
            Kunden. Der Betreiber haftet nicht für Schäden, die aus der Verwendung oder der Unmöglichkeit der
            Verwendung der Plattform entstehen, soweit gesetzlich zulässig.
          </p>
          <p>
            <strong>6.2</strong> Insbesondere wird <strong>keine Haftung</strong> übernommen für:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Fehlerhafte, unvollständige oder falsche KI-Ergebnisse (OCR, Validierung, Matching, Kategorisierung)</li>
            <li>Steuerliche Nachteile, Strafzuschläge oder Finanzamts-Bescheide, die auf Basis der Plattform-Ergebnisse entstehen</li>
            <li>Datenverlust, insbesondere wenn der Kunde keine eigene Archivierung vorgenommen hat</li>
            <li>Ausfälle, Unterbrechungen oder Nichtverfügbarkeit der Plattform</li>
            <li>Schäden durch Drittanbieter-Services (KI-Provider, Zahlungsdienstleister, etc.)</li>
            <li>Mittelbare Schäden, Folgeschäden, entgangenen Gewinn oder entgangene Geschäftschancen</li>
          </ul>
          <p>
            <strong>6.3</strong> In jedem Fall ist die Haftung des Betreibers <strong>der Höhe nach begrenzt auf
            die vom Kunden in den letzten 12 Monaten gezahlten Nutzungsentgelte</strong> für die Plattform.
          </p>
          <p>
            <strong>6.4</strong> Die vorstehenden Haftungsbeschränkungen gelten nicht für Schäden aus der
            Verletzung von Leben, Körper oder Gesundheit sowie nicht, soweit eine Haftung nach zwingenden
            gesetzlichen Vorschriften (insbesondere dem Produkthaftungsgesetz) besteht.
          </p>
        </section>

        {/* 7. Datensicherung */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">7. Datensicherung & Export</h2>
          <p>
            Die Plattform bietet Exportfunktionen (DSGVO-Datenexport, BMD-Export, Belegdownload). Der Kunde
            ist verpflichtet, <strong>regelmäßige Sicherungen seiner Daten vorzunehmen</strong>. Vor einer
            Kontolöschung muss der Kunde alle relevanten Daten exportieren. Nach der Löschung ist eine
            Wiederherstellung technisch nicht möglich.
          </p>
        </section>

        {/* 8. Verfügbarkeit */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">8. Systemverfügbarkeit</h2>
          <p>
            Der Betreiber bemüht sich um eine hohe Verfügbarkeit der Plattform, gibt jedoch
            <strong> keine Verfügbarkeitsgarantie</strong> ab. Wartungsarbeiten, technische Störungen oder
            Ereignisse höherer Gewalt können zu vorübergehender Nichtverfügbarkeit führen. Der Betreiber haftet
            nicht für Schäden oder Nachteile, die aus einer vorübergehenden oder dauerhaften Nichtverfügbarkeit
            der Plattform entstehen.
          </p>
        </section>

        {/* 9. Geistiges Eigentum */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">9. Geistiges Eigentum & Nutzungsrecht</h2>
          <p>
            Die Plattform und alle zugehörigen Inhalte sind urheberrechtlich geschützt. Der Kunde erhält
            ein nicht-exklusives, nicht übertragbares Nutzungsrecht für die Vertragslaufzeit. Alle vom
            Kunden hochgeladenen Daten und Belege verbleiben im Eigentum des Kunden.
          </p>
        </section>

        {/* 10. Kündigung */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">10. Vertragslaufzeit & Kündigung</h2>
          <p>
            Der Kunde kann sein Konto jederzeit über die Einstellungen löschen. Mit der Kontolöschung
            werden alle gespeicherten Daten unwiderruflich entfernt. Der Kunde ist selbst dafür verantwortlich,
            vor der Löschung alle Daten zu exportieren und die gesetzliche Aufbewahrungspflicht eigenständig
            sicherzustellen.
          </p>
        </section>

        {/* 11. Anwendbares Recht */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">11. Anwendbares Recht & Gerichtsstand</h2>
          <p>
            Es gilt ausschließlich <strong>österreichisches Recht</strong> unter Ausschluss des UN-Kaufrechts
            und der Verweisungsnormen des internationalen Privatrechts. Gerichtsstand ist das sachlich
            zuständige Gericht am Sitz des Betreibers, soweit gesetzlich zulässig.
          </p>
        </section>

        {/* 12. Schlussbestimmungen */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900">12. Schlussbestimmungen</h2>
          <p>
            Sollte eine Bestimmung dieser Nutzungsbedingungen unwirksam sein, bleibt die Wirksamkeit der
            übrigen Bestimmungen unberührt (salvatorische Klausel). Änderungen dieser Nutzungsbedingungen
            werden dem Kunden mit angemessener Frist mitgeteilt. Die weitere Nutzung nach Inkrafttreten
            gilt als Zustimmung.
          </p>
        </section>
      </div>

      <div className="mt-8 border-t pt-4 flex gap-4">
        <Link to="/privacy" className="text-primary-600 hover:underline text-sm">Datenschutzerklärung</Link>
        <Link to="/" className="text-primary-600 hover:underline text-sm">Zurück zum Dashboard</Link>
      </div>
    </div>
  );
}
