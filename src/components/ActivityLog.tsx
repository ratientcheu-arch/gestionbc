import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Activity, Mail, AlertTriangle, CheckCircle, XCircle, Clock, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  emails_found: number;
  emails_processed: number;
  interventions_created: number;
  error_message: string | null;
  sync_duration_ms: number;
  details: {
    skipped_irrelevant?: number;
    skipped_duplicate?: number;
    skipped_details?: string[];
    errors?: string[];
  } | null;
  created_at: string;
}

interface RecentIntervention {
  id: string;
  email_subject: string;
  email_from: string;
  client_name: string;
  address: string;
  description: string;
  etat: string;
  numero_trtp: string | null;
  created_at: string;
}

export default function ActivityLog({ organizationId }: { organizationId: string }) {
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [interventions, setInterventions] = useState<RecentIntervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = async () => {
    const [logsRes, intRes] = await Promise.all([
      supabase
        .from('intervention_sync_log')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('intervention_requests')
        .select('id, email_subject, email_from, client_name, address, description, etat, numero_trtp, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(20),
    ]);

    setSyncLogs(logsRes.data || []);
    setInterventions(intRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    loadData();
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [organizationId]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const getStatusBadge = (etat: string) => {
    const colors: Record<string, string> = {
      nouveau: 'bg-blue-100 text-blue-800',
      planifie: 'bg-green-100 text-green-800',
      annule: 'bg-red-100 text-red-800',
      en_cours: 'bg-yellow-100 text-yellow-800',
      termine: 'bg-gray-100 text-gray-800',
      erreur_validation: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      nouveau: 'Nouveau',
      planifie: 'Planifie',
      annule: 'Annule',
      en_cours: 'En cours',
      termine: 'Termine',
      erreur_validation: 'Erreur validation',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[etat] || 'bg-gray-100 text-gray-600'}`}>
        {labels[etat] || etat}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
      </div>
    );
  }

  // Compute stats
  const last24h = syncLogs.filter(l => new Date(l.created_at) > new Date(Date.now() - 86400000));
  const totalEmails24h = last24h.reduce((sum, l) => sum + l.emails_found, 0);
  const totalCreated24h = last24h.reduce((sum, l) => sum + l.interventions_created, 0);
  const totalSkipped24h = last24h.reduce((sum, l) => sum + (l.details?.skipped_irrelevant || 0) + (l.details?.skipped_duplicate || 0), 0);
  const totalErrors24h = last24h.filter(l => l.status === 'error').length;
  const lastSync = syncLogs.length > 0 ? syncLogs[0] : null;

  return (
    <div className="space-y-6">
      {/* Header with refresh */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-orange-500" />
          <h2 className="text-lg font-bold text-gray-900">Activite du systeme</h2>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 bg-white border rounded-lg hover:bg-gray-50"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualiser
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Derniere sync</div>
          <div className="text-sm font-bold text-gray-900 mt-1">
            {lastSync ? formatDate(lastSync.created_at) : 'Aucune'}
          </div>
          {lastSync && (
            <div className="text-xs text-gray-400 mt-0.5">{formatDuration(lastSync.sync_duration_ms)}</div>
          )}
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Emails (24h)</div>
          <div className="text-2xl font-bold text-blue-600 mt-1">{totalEmails24h}</div>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Crees (24h)</div>
          <div className="text-2xl font-bold text-green-600 mt-1">{totalCreated24h}</div>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Ignores (24h)</div>
          <div className="text-2xl font-bold text-yellow-600 mt-1">{totalSkipped24h}</div>
        </div>
        <div className="bg-white rounded-lg border p-3">
          <div className="text-xs text-gray-500">Erreurs (24h)</div>
          <div className={`text-2xl font-bold mt-1 ${totalErrors24h > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {totalErrors24h}
          </div>
        </div>
      </div>

      {/* Two columns: Sync Logs + Recent Interventions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Sync Logs */}
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Historique des synchronisations
            </h3>
          </div>
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {syncLogs.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">Aucune synchronisation</div>
            ) : (
              syncLogs.map(log => {
                const hasDetails = log.details && (
                  (log.details.skipped_details?.length || 0) > 0 ||
                  (log.details.errors?.length || 0) > 0
                );
                const isExpanded = expandedLog === log.id;
                const hasActivity = log.emails_found > 0 || log.error_message;

                return (
                  <div key={log.id} className={`${!hasActivity ? 'opacity-50' : ''}`}>
                    <div
                      className={`px-4 py-2.5 flex items-center gap-3 ${hasDetails ? 'cursor-pointer hover:bg-gray-50' : ''}`}
                      onClick={() => hasDetails && setExpandedLog(isExpanded ? null : log.id)}
                    >
                      {/* Status icon */}
                      {log.status === 'error' ? (
                        <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      ) : log.interventions_created > 0 ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : log.emails_found > 0 ? (
                        <Mail className="w-4 h-4 text-yellow-500 flex-shrink-0" />
                      ) : (
                        <Clock className="w-4 h-4 text-gray-300 flex-shrink-0" />
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {formatDate(log.created_at)}
                          </span>
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            log.sync_type === 'auto' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'
                          }`}>
                            {log.sync_type}
                          </span>
                        </div>
                        <div className="text-sm text-gray-700 mt-0.5">
                          {log.emails_found === 0 ? (
                            <span className="text-gray-400">Aucun email</span>
                          ) : (
                            <>
                              <span className="font-medium">{log.emails_found}</span> email{log.emails_found > 1 ? 's' : ''}
                              {log.interventions_created > 0 && (
                                <span className="text-green-600 ml-1">
                                  → {log.interventions_created} intervention{log.interventions_created > 1 ? 's' : ''} creee{log.interventions_created > 1 ? 's' : ''}
                                </span>
                              )}
                              {(log.details?.skipped_irrelevant || 0) > 0 && (
                                <span className="text-yellow-600 ml-1">
                                  • {log.details?.skipped_irrelevant} ignore{(log.details?.skipped_irrelevant || 0) > 1 ? 's' : ''}
                                </span>
                              )}
                              {(log.details?.skipped_duplicate || 0) > 0 && (
                                <span className="text-gray-500 ml-1">
                                  • {log.details?.skipped_duplicate} doublon{(log.details?.skipped_duplicate || 0) > 1 ? 's' : ''}
                                </span>
                              )}
                            </>
                          )}
                        </div>
                        {log.error_message && (
                          <div className="text-xs text-red-600 mt-0.5 truncate">{log.error_message}</div>
                        )}
                      </div>

                      {/* Duration + expand */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-gray-400">{formatDuration(log.sync_duration_ms)}</span>
                        {hasDetails && (
                          isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && log.details && (
                      <div className="px-4 py-2 bg-gray-50 border-t text-xs space-y-1">
                        {log.details.skipped_details?.map((detail, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <AlertTriangle className="w-3 h-3 text-yellow-500 mt-0.5 flex-shrink-0" />
                            <span className="text-gray-600">{detail}</span>
                          </div>
                        ))}
                        {log.details.errors?.map((err, idx) => (
                          <div key={idx} className="flex items-start gap-2">
                            <XCircle className="w-3 h-3 text-red-500 mt-0.5 flex-shrink-0" />
                            <span className="text-red-600">{err}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent Interventions */}
        <div className="bg-white rounded-xl border">
          <div className="px-4 py-3 border-b bg-gray-50 rounded-t-xl">
            <h3 className="font-semibold text-gray-700 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Dernieres interventions recues
            </h3>
          </div>
          <div className="divide-y max-h-[500px] overflow-y-auto">
            {interventions.length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">Aucune intervention</div>
            ) : (
              interventions.map(int => (
                <div key={int.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      {getStatusBadge(int.etat)}
                      {int.numero_trtp && (
                        <span className="text-xs font-mono font-bold text-gray-700">{int.numero_trtp}</span>
                      )}
                    </div>
                    <span className="text-xs text-gray-400">{formatDate(int.created_at)}</span>
                  </div>
                  <div className="text-sm font-medium text-gray-800 truncate">
                    {int.email_subject || '(sans objet)'}
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    De: {int.email_from} • Client: {int.client_name}
                  </div>
                  {int.address && (
                    <div className="text-xs text-gray-400 mt-0.5 truncate">
                      Adresse: {int.address}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
