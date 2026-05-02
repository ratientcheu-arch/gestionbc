import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';

interface ValidationResultProps {
  status: string;
  trtp: string | null;
  client: string | null;
  address: string | null;
  subject: string | null;
  details: string | null;
  error: string | null;
}

export default function ValidationResult({ status, trtp, client, address, subject, details, error }: ValidationResultProps) {
  const isApproved = status === 'approved';
  const isRejected = status === 'rejected';
  const isError = status === 'error';
  const isAlreadyProcessed = status === 'already_processed';

  const getIcon = () => {
    if (isApproved) return <CheckCircle className="w-16 h-16 text-green-500" />;
    if (isRejected) return <XCircle className="w-16 h-16 text-red-500" />;
    return <AlertCircle className="w-16 h-16 text-orange-500" />;
  };

  const getTitle = () => {
    if (isApproved) return 'Intervention validee';
    if (isRejected) return 'Intervention refusee';
    if (isAlreadyProcessed) return 'Deja traitee';
    if (isError) return 'Erreur';
    return 'Resultat';
  };

  const getMessage = () => {
    if (isApproved) return `L'intervention ${trtp || ''} a ete validee et planifiee avec succes.`;
    if (isRejected) return `L'intervention a ete refusee et annulee. Aucune ligne n'a ete ajoutee au Google Sheets ni a Synchroteam.`;
    if (isAlreadyProcessed) return details || 'Cette intervention a deja ete traitee.';
    if (isError) return error || 'Une erreur est survenue lors du traitement.';
    return 'Traitement termine.';
  };

  const getBgColor = () => {
    if (isApproved) return 'bg-green-50';
    if (isRejected) return 'bg-red-50';
    return 'bg-orange-50';
  };

  const getHeaderColor = () => {
    if (isApproved) return 'bg-green-600';
    if (isRejected) return 'bg-red-600';
    return 'bg-orange-500';
  };

  return (
    <div className={`min-h-screen ${getBgColor()} flex items-center justify-center p-4`}>
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className={`${getHeaderColor()} text-white text-center py-8`}>
          <div className="flex justify-center mb-4">
            {getIcon()}
          </div>
          <h1 className="text-2xl font-bold">{getTitle()}</h1>
        </div>

        {/* Body */}
        <div className="p-6">
          <p className="text-gray-600 text-center text-lg mb-6">{getMessage()}</p>

          {(client || address || subject || details) && (
            <div className={`${getBgColor()} rounded-xl p-5 space-y-3`}>
              {trtp && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">N TRTP</span>
                  <span className="text-sm font-bold text-gray-900">{trtp}</span>
                </div>
              )}
              {client && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Client</span>
                  <span className="text-sm text-gray-900">{client}</span>
                </div>
              )}
              {address && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Adresse</span>
                  <span className="text-sm text-gray-900">{address}</span>
                </div>
              )}
              {subject && (
                <div className="flex justify-between">
                  <span className="text-sm font-medium text-gray-500">Objet</span>
                  <span className="text-sm text-gray-900">{subject}</span>
                </div>
              )}
              {details && isApproved && (
                <div className="border-t pt-3 mt-3">
                  <p className="text-xs text-gray-500">{details}</p>
                </div>
              )}
            </div>
          )}

          <p className="text-center text-sm text-gray-400 mt-6">
            Vous pouvez fermer cette page.
          </p>
        </div>

        {/* Footer */}
        <div className="bg-gray-50 border-t px-6 py-4 text-center">
          <p className="text-xs text-gray-400">TRTP SAS - Gestion des Interventions</p>
        </div>
      </div>
    </div>
  );
}
