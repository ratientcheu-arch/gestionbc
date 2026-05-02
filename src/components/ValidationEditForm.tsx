import { useState, useEffect } from 'react';
import { CheckCircle, XCircle, Loader2, AlertTriangle, FileText, ExternalLink } from 'lucide-react';

interface InterventionData {
  id: string;
  client_name: string;
  numero_bt_client: string;
  numero_nexxio: string;
  address: string;
  ville: string;
  code_postal: string;
  contact_sur_site: string;
  telephone_contact: string;
  description: string;
  urgency: string;
  duree_prevue: string;
  date_commande: string;
  date_fin: string;
  reference_client: string;
  nexxio_status: string;
  nexxio_urgent: boolean;
  bc_pdf_url: string;
  email_subject: string;
  email_from: string;
  email_date: string;
  request_type: string;
  attachment_url: string;
  attachment_name: string;
  nexxio_link: string;
  suivi?: string;
  reference_patrimoine?: string;
  gardien_nom?: string;
  gardien_tel?: string;
  locataire_nom?: string;
  locataire_tel?: string;
}

interface Props {
  token: string;
}

export default function ValidationEditForm({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<InterventionData | null>(null);
  const [result, setResult] = useState<{ validation: string; trtp?: string; client?: string; details?: string } | null>(null);

  // Editable fields
  const [clientName, setClientName] = useState('');
  const [refPatrimoine, setRefPatrimoine] = useState('');
  const [numeroBt, setNumeroBt] = useState('');
  const [address, setAddress] = useState('');
  const [ville, setVille] = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [gardienNom, setGardienNom] = useState('');
  const [gardienTel, setGardienTel] = useState('');
  const [locataireNom, setLocataireNom] = useState('');
  const [locataireTel, setLocataireTel] = useState('');
  const [suivi, setSuivi] = useState('');
  const [urgency, setUrgency] = useState('normale');
  const [dureePrevue, setDureePrevue] = useState('');

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  // Determine label for ref patrimoine based on client
  const refPatrimoineLabel = clientName.toLowerCase().includes('habitat 77')
    ? 'Module'
    : 'Référence patrimoine';

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/validate-intervention?token=${token}&action=get_data`
      );
      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'Impossible de charger les données');
        setLoading(false);
        return;
      }

      const intervention = result.intervention;
      setData(intervention);
      setClientName(intervention.client_name || '');
      setRefPatrimoine(intervention.reference_patrimoine || intervention.reference_client || '');
      setNumeroBt(intervention.numero_bt_client || '');
      setAddress(intervention.address || '');
      setVille(intervention.ville || '');
      setCodePostal(intervention.code_postal || '');

      // Use separate gardien/locataire fields if available (nexxio_api source)
      if (intervention.gardien_nom || intervention.gardien_tel || intervention.locataire_nom || intervention.locataire_tel) {
        setGardienNom(intervention.gardien_nom || '');
        setGardienTel(intervention.gardien_tel || '');
        setLocataireNom(intervention.locataire_nom || '');
        setLocataireTel(intervention.locataire_tel || '');
      } else {
        // Fallback: parse contact_sur_site to split gardien / locataire
        const contact = intervention.contact_sur_site || '';
        const phone = intervention.telephone_contact || '';
        // Try to split if format is "Gardien: X / Locataire: Y"
        const gardienMatch = contact.match(/gardien\s*[:\-]\s*(.+?)(?:\s*[\/|]\s*|$)/i);
        const locataireMatch = contact.match(/(?:locataire|contact)\s*[:\-]\s*(.+?)$/i);
        if (gardienMatch && locataireMatch) {
          setGardienNom(gardienMatch[1].trim());
          setLocataireNom(locataireMatch[1].trim());
        } else {
          // Put everything in gardien by default
          setGardienNom(contact);
          setLocataireNom('');
        }

        // Try to split phone similarly
        const phones = phone.split(/[\/|,;]/).map((p: string) => p.trim()).filter(Boolean);
        setGardienTel(phones[0] || '');
        setLocataireTel(phones[1] || '');
      }

      // Ensure suivi starts with "Nature de l'intervention :"
      let suiviText = intervention.suivi || intervention.description || '';
      if (suiviText && !suiviText.startsWith('Nature de l\'intervention')) {
        suiviText = `Nature de l'intervention : ${suiviText}`;
      }
      if (!suiviText) {
        suiviText = 'Nature de l\'intervention : ';
      }
      setSuivi(suiviText);

      setUrgency(intervention.urgency || 'normale');
      setDureePrevue(intervention.duree_prevue || '');
      setLoading(false);
    } catch (e: any) {
      setError(e.message || 'Erreur de connexion');
      setLoading(false);
    }
  };

  const handleSubmit = async (action: 'approve' | 'reject') => {
    setSubmitting(true);
    try {
      const response = await fetch(
        `${supabaseUrl}/functions/v1/validate-intervention`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            token,
            action,
            fields: action === 'approve' ? {
              client_name: clientName,
              reference_patrimoine: refPatrimoine,
              numero_bt_client: numeroBt,
              address,
              ville,
              code_postal: codePostal,
              gardien_nom: gardienNom,
              gardien_tel: gardienTel,
              locataire_nom: locataireNom,
              locataire_tel: locataireTel,
              suivi,
              urgency,
              duree_prevue: dureePrevue,
            } : {},
          }),
        }
      );

      const res = await response.json();
      if (!response.ok) {
        setError(res.error || 'Erreur lors de la validation');
        setSubmitting(false);
        return;
      }

      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Erreur de connexion');
      setSubmitting(false);
    }
  };

  // Show result after validation
  if (result) {
    const isApproved = result.validation === 'approved';
    return (
      <div className={`min-h-screen ${isApproved ? 'bg-green-50' : 'bg-red-50'} flex items-center justify-center p-4`}>
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
          <div className={`${isApproved ? 'bg-green-600' : 'bg-red-600'} text-white text-center py-8`}>
            <div className="flex justify-center mb-4">
              {isApproved ? <CheckCircle className="w-16 h-16" /> : <XCircle className="w-16 h-16" />}
            </div>
            <h1 className="text-2xl font-bold">
              {isApproved ? 'Intervention validée' : 'Intervention refusée'}
            </h1>
          </div>
          <div className="p-6 text-center">
            {isApproved && result.trtp && (
              <p className="text-lg font-bold text-green-700 mb-2">N° TRTP : {result.trtp}</p>
            )}
            <p className="text-gray-600">
              {isApproved
                ? 'L\'intervention a été validée et planifiée avec succès.'
                : 'L\'intervention a été refusée et annulée.'}
            </p>
            {result.details && (
              <p className="text-xs text-gray-400 mt-4">{result.details}</p>
            )}
            <p className="text-sm text-gray-400 mt-6">Vous pouvez fermer cette page.</p>
          </div>
          <div className="bg-gray-50 border-t px-6 py-4 text-center">
            <p className="text-xs text-gray-400">TRTP SAS - Gestion des Interventions</p>
          </div>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-orange-500 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Chargement de l'intervention...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !data) {
    return (
      <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
          <div className="bg-orange-500 text-white text-center py-8">
            <AlertTriangle className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-2xl font-bold">Erreur</h1>
          </div>
          <div className="p-6 text-center">
            <p className="text-gray-600">{error}</p>
            <p className="text-sm text-gray-400 mt-6">Vous pouvez fermer cette page.</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-orange-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-[#E65100] text-white rounded-t-2xl px-6 py-5">
          <h1 className="text-xl font-bold">Validation d'intervention</h1>
          <p className="text-sm opacity-90 mt-1">Vérifiez et complétez les informations avant de valider</p>
        </div>

        <div className="bg-white rounded-b-2xl shadow-xl">
          {/* Email info (read-only) */}
          <div className="px-6 py-4 bg-gray-50 border-b">
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <span className="font-medium">Email :</span>
              <span>{data.email_from}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
              <span className="font-medium">Objet :</span>
              <span>{data.email_subject}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="font-medium">Date :</span>
              <span>{data.email_date ? new Date(data.email_date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}</span>
            </div>
            {data.numero_nexxio && (
              <div className="flex items-center gap-2 text-sm mt-1">
                <span className="font-medium text-gray-500">N° Nexxio :</span>
                <span className="font-bold text-blue-600">{data.numero_nexxio}</span>
              </div>
            )}
            {data.reference_client && (
              <div className="flex items-center gap-2 text-sm mt-1">
                <span className="font-medium text-gray-500">Réf. client :</span>
                <span className="text-gray-700">{data.reference_client}</span>
              </div>
            )}
            {data.nexxio_status && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <span className="font-medium">État Nexxio :</span>
                <span>{data.nexxio_status}</span>
              </div>
            )}
            {data.date_commande && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <span className="font-medium">Date commande :</span>
                <span>{data.date_commande}</span>
              </div>
            )}
            {data.date_fin && (
              <div className="flex items-center gap-2 text-sm text-gray-500 mt-1">
                <span className="font-medium">Date fin théorique :</span>
                <span>{data.date_fin}</span>
              </div>
            )}
            {/* Links */}
            <div className="flex gap-3 mt-2">
              {data.bc_pdf_url && (
                <a href={data.bc_pdf_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <FileText className="w-3 h-3" /> Bon de commande PDF
                </a>
              )}
              {data.nexxio_link && (
                <a href={data.nexxio_link} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                  <ExternalLink className="w-3 h-3" /> Voir sur Nexxio
                </a>
              )}
            </div>
          </div>

          {/* Editable form */}
          <div className="px-6 py-5 space-y-5">
            {data.nexxio_urgent && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
                <span className="text-red-700 font-bold text-sm">COMMANDE URGENTE</span>
              </div>
            )}

            {error && (
              <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm">{error}</div>
            )}

            {/* ── SECTION 1 : Donneur d'ordre ── */}
            <div>
              <div className="flex items-center gap-2 mb-3 pb-1 border-b-2 border-orange-400">
                <span className="text-sm font-bold text-orange-700 uppercase tracking-wide">Donneur d'ordre</span>
              </div>
              <div className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nom du client</label>
                    <input
                      type="text"
                      value={clientName}
                      onChange={e => setClientName(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">N° BT client</label>
                    <input
                      type="text"
                      value={numeroBt}
                      onChange={e => setNumeroBt(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{refPatrimoineLabel}</label>
                  <input
                    type="text"
                    value={refPatrimoine}
                    onChange={e => setRefPatrimoine(e.target.value)}
                    placeholder={clientName.toLowerCase().includes('habitat 77') ? 'ex: MOD-12345' : 'ex: rivp n°123456'}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                  />
                </div>
              </div>
            </div>

            {/* ── SECTION 2 : Lieu d'intervention ── */}
            <div>
              <div className="flex items-center gap-2 mb-3 pb-1 border-b-2 border-blue-400">
                <span className="text-sm font-bold text-blue-700 uppercase tracking-wide">Lieu d'intervention</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Adresse (N° et nom de rue)</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="ex: 12 rue de la Paix"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Code postal</label>
                  <input
                    type="text"
                    value={codePostal}
                    onChange={e => setCodePostal(e.target.value)}
                    placeholder="ex: 77000"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
              <div className="mt-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Ville</label>
                  <input
                    type="text"
                    value={ville}
                    onChange={e => setVille(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>

            {/* ── SECTION 3 : Gardien ── */}
            <div>
              <div className="flex items-center gap-2 mb-3 pb-1 border-b-2 border-green-400">
                <span className="text-sm font-bold text-green-700 uppercase tracking-wide">Gardien</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom du gardien</label>
                  <input
                    type="text"
                    value={gardienNom}
                    onChange={e => setGardienNom(e.target.value)}
                    placeholder="ex: M. Dupont"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone gardien</label>
                  <input
                    type="tel"
                    value={gardienTel}
                    onChange={e => setGardienTel(e.target.value)}
                    placeholder="ex: 06 12 34 56 78"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  />
                </div>
              </div>
            </div>

            {/* ── SECTION 4 : Locataire / Contact ── */}
            <div>
              <div className="flex items-center gap-2 mb-3 pb-1 border-b-2 border-teal-400">
                <span className="text-sm font-bold text-teal-700 uppercase tracking-wide">Locataire / Contact</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nom du locataire ou contact</label>
                  <input
                    type="text"
                    value={locataireNom}
                    onChange={e => setLocataireNom(e.target.value)}
                    placeholder="ex: Mme Martin"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Téléphone locataire</label>
                  <input
                    type="tel"
                    value={locataireTel}
                    onChange={e => setLocataireTel(e.target.value)}
                    placeholder="ex: 07 65 43 21 09"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  />
                </div>
              </div>
            </div>

            {/* ── SECTION 5 : Détails de l'intervention ── */}
            <div>
              <div className="flex items-center gap-2 mb-3 pb-1 border-b-2 border-purple-400">
                <span className="text-sm font-bold text-purple-700 uppercase tracking-wide">Détails de l'intervention</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Urgence</label>
                  <select
                    value={urgency}
                    onChange={e => setUrgency(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  >
                    <option value="normale">Normale</option>
                    <option value="urgente">Urgente</option>
                    <option value="critique">Critique</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Durée prévue</label>
                  <input
                    type="text"
                    value={dureePrevue}
                    onChange={e => setDureePrevue(e.target.value)}
                    placeholder="ex: 2 jours"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description / Suivi
                  <span className="text-xs text-gray-400 ml-2">(sera enregistré dans le tableau de suivi et Synchroteam)</span>
                </label>
                <textarea
                  value={suivi}
                  onChange={e => setSuivi(e.target.value)}
                  rows={5}
                  placeholder="Nature de l'intervention : ..."
                  className="w-full px-3 py-2 border border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 bg-purple-50"
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <button
                onClick={() => handleSubmit('approve')}
                disabled={submitting}
                className="flex-1 py-3 bg-green-600 text-white rounded-lg font-bold hover:bg-green-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle className="w-5 h-5" />}
                VALIDER
              </button>
              <button
                onClick={() => handleSubmit('reject')}
                disabled={submitting}
                className="flex-1 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <XCircle className="w-5 h-5" />}
                REFUSER
              </button>
            </div>
          </div>

          {/* Footer */}
          <div className="bg-gray-50 border-t px-6 py-4 text-center rounded-b-2xl">
            <p className="text-xs text-gray-400">TRTP SAS - Gestion des Interventions</p>
          </div>
        </div>
      </div>
    </div>
  );
}
