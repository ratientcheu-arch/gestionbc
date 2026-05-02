import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import {
  ClipboardList, Settings, RefreshCw, CheckCircle, XCircle,
  Clock, AlertCircle, Mail, Paperclip, ExternalLink,
  Search, Plus, Trash2, Eye, EyeOff
} from 'lucide-react';

interface InterventionConfigData {
  id: string;
  organization_id: string;
  enabled: boolean;
  gmail_email: string;
  gmail_app_password: string;
  gmail_label: string;
  google_sheets_id: string;
  google_sheets_gid: string;
  google_service_account_json: string;
  synchroteam_domain: string;
  synchroteam_api_key: string;
  auto_create_synchroteam: boolean;
  nexxio_username: string;
  nexxio_password: string;
  nexxio_base_url: string;
  auto_sync_enabled: boolean;
  check_interval_minutes: number;
  last_check_at: string | null;
  notification_email: string | null;
}

interface InterventionRequest {
  id: string;
  email_from: string;
  email_subject: string;
  email_body: string;
  email_date: string;
  request_type: 'text_libre' | 'piece_jointe' | 'lien_nexxio';
  numero_trtp: string | null;
  numero_bt_client: string | null;
  numero_nexxio: string | null;
  client_name: string | null;
  address: string | null;
  description: string | null;
  urgency: string;
  etat: string;
  duree_prevue: string | null;
  duree_reelle: string | null;
  assigned_to: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  nexxio_link: string | null;
  synchroteam_job_id: string | null;
  google_sheets_row: number | null;
  created_at: string;
}

interface SyncLog {
  id: string;
  sync_type: string;
  status: string;
  emails_found: number;
  emails_processed: number;
  interventions_created: number;
  sheets_updated: number;
  synchroteam_created: number;
  error_message: string | null;
  sync_duration_ms: number;
  created_at: string;
}

interface EmailSource {
  id: string;
  label: string;
  gmail_email: string;
  gmail_app_password: string;
  gmail_label: string;
  imap_host: string;
  imap_port: number;
  default_client_name: string | null;
  enabled: boolean;
  last_check_at: string | null;
  last_error: string | null;
}

const EMAIL_PROVIDERS: Record<string, { label: string; imap_host: string; imap_port: number }> = {
  gmail: { label: 'Gmail / Google Workspace', imap_host: 'imap.gmail.com', imap_port: 993 },
  hostinger: { label: 'Hostinger', imap_host: 'imap.hostinger.com', imap_port: 993 },
  ovh: { label: 'OVH', imap_host: 'ssl0.ovh.net', imap_port: 993 },
  ionos: { label: 'IONOS (1&1)', imap_host: 'imap.ionos.fr', imap_port: 993 },
  outlook: { label: 'Outlook / Office 365', imap_host: 'outlook.office365.com', imap_port: 993 },
  custom: { label: 'Autre (personnalisé)', imap_host: '', imap_port: 993 },
};

interface Props {
  organizationId: string;
}

export default function InterventionRequests({ organizationId }: Props) {
  const [activeTab, setActiveTab] = useState<'interventions' | 'config' | 'logs'>('interventions');
  const [config, setConfig] = useState<InterventionConfigData | null>(null);
  const [emailSources, setEmailSources] = useState<EmailSource[]>([]);
  const [newSource, setNewSource] = useState({ label: '', gmail_email: '', gmail_app_password: '', gmail_label: 'INBOX', default_client_name: '', provider: 'gmail', imap_host: 'imap.gmail.com', imap_port: 993 });
  const [showAddSource, setShowAddSource] = useState(false);
  const [interventions, setInterventions] = useState<InterventionRequest[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedIntervention, setSelectedIntervention] = useState<string | null>(null);
  const [filterEtat, setFilterEtat] = useState<string>('all');
  const [filterUrgency, setFilterUrgency] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [formData, setFormData] = useState({
    enabled: false,
    gmail_email: '',
    gmail_app_password: '',
    gmail_label: 'INBOX',
    google_sheets_id: '1IuACcsKvDIEo4FUdOPMJ69f3sH-LYS5NKJkCo7Hxqrk',
    google_sheets_gid: '41359526',
    google_service_account_json: '',
    synchroteam_domain: '',
    synchroteam_api_key: '',
    auto_create_synchroteam: true,
    nexxio_username: '',
    nexxio_password: '',
    nexxio_base_url: '',
    auto_sync_enabled: true,
    check_interval_minutes: 15,
    notification_email: 'trtp@tr-tp.com',
  });

  // Chargement initial
  useEffect(() => {
    loadConfig();
    loadEmailSources();
    loadInterventions();
    loadLogs();
  }, [organizationId]);

  // Auto-sync : appeler la Edge Function automatiquement + polling UI + Realtime
  useEffect(() => {
    if (!organizationId) return;

    // Polling UI : rafraîchir l'affichage toutes les 30 secondes
    const pollInterval = setInterval(() => {
      loadInterventions();
      loadLogs();
    }, 30000);

    // Auto-sync : appeler process-intervention-emails depuis le client
    // Le cron pg_cron ne fonctionne pas de manière fiable via pg_net
    const autoSync = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        // Vérifier si la dernière sync date de plus de check_interval_minutes
        const { data: cfg } = await supabase
          .from('intervention_config')
          .select('auto_sync_enabled, check_interval_minutes, last_check_at')
          .eq('organization_id', organizationId)
          .maybeSingle();

        if (!cfg?.auto_sync_enabled) return;

        const interval = (cfg.check_interval_minutes || 10) * 60 * 1000; // en ms
        const lastCheck = cfg.last_check_at ? new Date(cfg.last_check_at).getTime() : 0;
        const now = Date.now();

        if (now - lastCheck < interval) {
          console.log(`⏳ Auto-sync: prochaine sync dans ${Math.round((interval - (now - lastCheck)) / 1000)}s`);
          return;
        }

        console.log('🔄 Auto-sync: lancement du traitement des emails...');

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-intervention-emails`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${session.access_token}`,
              'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              organizationId,
              syncType: 'auto',
            }),
          }
        );

        if (response.ok) {
          const result = await response.json();
          console.log('✅ Auto-sync terminé:', result);
          if (result.interventionsCreated > 0) {
            loadInterventions();
            loadLogs();
          }
        } else {
          console.error('❌ Auto-sync erreur HTTP:', response.status);
        }
      } catch (err) {
        console.error('❌ Auto-sync erreur:', err);
      }
    };

    // Lancer immédiatement au chargement puis toutes les 2 minutes
    autoSync();
    const autoSyncInterval = setInterval(autoSync, 120000); // 2 minutes

    // Supabase Realtime : écouter les nouvelles interventions
    const channel = supabase
      .channel(`interventions-${organizationId}`)
      .on('postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'intervention_requests',
          filter: `organization_id=eq.${organizationId}`
        },
        (payload) => {
          console.log('🔔 Nouvelle intervention reçue en temps réel:', payload.new);
          setInterventions(prev => [payload.new as any, ...prev]);
        }
      )
      .on('postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'intervention_requests',
          filter: `organization_id=eq.${organizationId}`
        },
        (payload) => {
          console.log('🔄 Intervention mise à jour:', payload.new);
          setInterventions(prev =>
            prev.map(i => i.id === (payload.new as any).id ? (payload.new as any) : i)
          );
        }
      )
      .subscribe();

    return () => {
      clearInterval(pollInterval);
      clearInterval(autoSyncInterval);
      supabase.removeChannel(channel);
    };
  }, [organizationId]);

  const loadConfig = async () => {
    const { data, error } = await supabase
      .from('intervention_config')
      .select('*')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (error) {
      console.error('Error loading config:', error);
      setLoading(false);
      return;
    }

    if (data) {
      setConfig(data);
      setFormData({
        enabled: data.enabled,
        gmail_email: data.gmail_email || '',
        gmail_app_password: '',
        gmail_label: data.gmail_label || 'INBOX',
        google_sheets_id: data.google_sheets_id || '1IuACcsKvDIEo4FUdOPMJ69f3sH-LYS5NKJkCo7Hxqrk',
        google_sheets_gid: data.google_sheets_gid || '41359526',
        google_service_account_json: '',
        synchroteam_domain: data.synchroteam_domain || '',
        synchroteam_api_key: '',
        auto_create_synchroteam: data.auto_create_synchroteam,
        nexxio_username: data.nexxio_username || '',
        nexxio_password: '',
        nexxio_base_url: data.nexxio_base_url || '',
        auto_sync_enabled: data.auto_sync_enabled,
        check_interval_minutes: data.check_interval_minutes || 15,
        notification_email: data.notification_email || 'trtp@tr-tp.com',
      });
    }

    setLoading(false);
  };

  const loadInterventions = async () => {
    const { data, error } = await supabase
      .from('intervention_requests')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('Error loading interventions:', error);
      return;
    }

    setInterventions(data || []);
  };

  const loadLogs = async () => {
    const { data, error } = await supabase
      .from('intervention_sync_log')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      console.error('Error loading logs:', error);
      return;
    }

    setLogs(data || []);
  };

  const loadEmailSources = async () => {
    const { data } = await supabase
      .from('intervention_email_sources')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true });
    setEmailSources(data || []);
  };

  const addEmailSource = async () => {
    if (!newSource.label || !newSource.gmail_email || !newSource.gmail_app_password) {
      alert('Veuillez remplir le libellé, l\'email et le mot de passe d\'application');
      return;
    }
    const { error } = await supabase.from('intervention_email_sources').insert({
      organization_id: organizationId,
      label: newSource.label,
      gmail_email: newSource.gmail_email,
      gmail_app_password: newSource.gmail_app_password,
      gmail_label: newSource.gmail_label || 'INBOX',
      imap_host: newSource.imap_host,
      imap_port: newSource.imap_port,
      default_client_name: newSource.default_client_name || null,
      enabled: true,
    });
    if (error) {
      alert(`Erreur: ${error.message}`);
      return;
    }
    setNewSource({ label: '', gmail_email: '', gmail_app_password: '', gmail_label: 'INBOX', default_client_name: '', provider: 'gmail', imap_host: 'imap.gmail.com', imap_port: 993 });
    setShowAddSource(false);
    await loadEmailSources();
  };

  const toggleEmailSource = async (id: string, enabled: boolean) => {
    await supabase.from('intervention_email_sources').update({ enabled }).eq('id', id);
    await loadEmailSources();
  };

  const deleteEmailSource = async (id: string) => {
    if (!confirm('Supprimer cette boîte mail ?')) return;
    await supabase.from('intervention_email_sources').delete().eq('id', id);
    await loadEmailSources();
  };

  const saveConfig = async () => {
    setSaving(true);

    try {
      const configData: Record<string, any> = {
        organization_id: organizationId,
        enabled: formData.enabled,
        gmail_email: formData.gmail_email || null,
        gmail_label: formData.gmail_label || 'INBOX',
        google_sheets_id: formData.google_sheets_id || null,
        google_sheets_gid: formData.google_sheets_gid || null,
        synchroteam_domain: formData.synchroteam_domain || null,
        auto_create_synchroteam: formData.auto_create_synchroteam,
        nexxio_username: formData.nexxio_username || null,
        nexxio_base_url: formData.nexxio_base_url || null,
        auto_sync_enabled: formData.auto_sync_enabled,
        check_interval_minutes: formData.check_interval_minutes,
        notification_email: formData.notification_email || 'trtp@tr-tp.com',
      };

      if (formData.gmail_app_password) {
        configData.gmail_app_password = formData.gmail_app_password;
      }
      if (formData.google_service_account_json) {
        configData.google_service_account_json = formData.google_service_account_json;
      }
      if (formData.synchroteam_api_key) {
        configData.synchroteam_api_key = formData.synchroteam_api_key;
      }
      if (formData.nexxio_password) {
        configData.nexxio_password = formData.nexxio_password;
      }

      if (config) {
        const { error } = await supabase
          .from('intervention_config')
          .update(configData)
          .eq('id', config.id);
        if (error) throw error;
      } else {
        if (!configData.gmail_app_password) configData.gmail_app_password = '';
        if (!configData.google_service_account_json) configData.google_service_account_json = '';
        if (!configData.synchroteam_api_key) configData.synchroteam_api_key = '';
        if (!configData.nexxio_password) configData.nexxio_password = '';

        const { error } = await supabase
          .from('intervention_config')
          .insert(configData);
        if (error) throw error;
      }

      await loadConfig();
      alert('Configuration sauvegardée avec succès');
    } catch (error: any) {
      alert(`Erreur lors de la sauvegarde: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const syncNow = async () => {
    setSyncing(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-intervention-emails`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId,
            syncType: 'manual',
          }),
        }
      );

      let result: any;
      const responseText = await response.text();
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 300)}`);
      }

      if (!response.ok) {
        const errorMsg = result.error || result.msg || result.message || JSON.stringify(result);
        throw new Error(errorMsg);
      }

      alert(
        `Synchronisation terminée !\n` +
        `Emails trouvés : ${result.emailsFound}` +
        (result.emailsTotal && result.emailsTotal !== result.emailsFound ? ` (${result.emailsTotal} total, ${result.emailsFound} < 1h)` : '') + `\n` +
        `Interventions créées : ${result.interventionsCreated}\n` +
        (result.skippedDuplicate ? `Doublons ignorés : ${result.skippedDuplicate}\n` : '') +
        (result.skippedIrrelevant ? `Filtrés (whitelist) : ${result.skippedIrrelevant}\n` : '') +
        `Google Sheets mis à jour : ${result.sheetsUpdated}\n` +
        `Jobs Synchroteam créés : ${result.synchroteamCreated}` +
        (result.skippedDetails?.length ? `\n\nDétails :\n${result.skippedDetails.join('\n')}` : '') +
        (result.errors ? `\n\nErreurs : ${result.errors.join('\n')}` : '')
      );

      await loadInterventions();
      await loadLogs();
    } catch (error: any) {
      alert(`Erreur : ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const retrySheetsSync = async () => {
    setSyncing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Non authentifié');

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/process-intervention-emails`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            organizationId,
            action: 'retry-sheets',
          }),
        }
      );

      let result: any;
      const responseText = await response.text();
      try {
        result = JSON.parse(responseText);
      } catch {
        throw new Error(`HTTP ${response.status}: ${responseText.substring(0, 300)}`);
      }

      if (!response.ok) {
        throw new Error(result.error || JSON.stringify(result));
      }

      alert(
        `Resync Google Sheets terminé !\n` +
        `Total à synchroniser : ${result.total || 0}\n` +
        `Synchronisés : ${result.synced || 0}` +
        (result.errors ? `\n\nErreurs : ${result.errors.join('\n')}` : '') +
        (result.message ? `\n\n${result.message}` : '')
      );

      await loadInterventions();
    } catch (error: any) {
      alert(`Erreur resync Sheets : ${error.message}`);
    } finally {
      setSyncing(false);
    }
  };

  const pendingSheetsCount = interventions.filter(i => !i.google_sheets_row).length;

  const filteredInterventions = interventions.filter(i => {
    if (filterEtat !== 'all' && i.etat !== filterEtat) return false;
    if (filterUrgency !== 'all' && i.urgency !== filterUrgency) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        i.client_name?.toLowerCase().includes(q) ||
        i.email_subject?.toLowerCase().includes(q) ||
        i.address?.toLowerCase().includes(q) ||
        i.numero_trtp?.toLowerCase().includes(q) ||
        i.numero_bt_client?.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const selectedDetail = interventions.find(i => i.id === selectedIntervention);

  const getEtatBadge = (etat: string) => {
    const styles: Record<string, string> = {
      nouveau: 'bg-blue-100 text-blue-800',
      en_cours: 'bg-yellow-100 text-yellow-800',
      planifie: 'bg-purple-100 text-purple-800',
      termine: 'bg-green-100 text-green-800',
      annule: 'bg-gray-100 text-gray-800',
      erreur_validation: 'bg-red-100 text-red-800',
    };
    const labels: Record<string, string> = {
      nouveau: 'Nouveau',
      en_cours: 'En cours',
      planifie: 'Planifié',
      termine: 'Terminé',
      annule: 'Annulé',
      erreur_validation: 'Erreur validation',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[etat] || 'bg-gray-100 text-gray-800'}`}>
        {labels[etat] || etat}
      </span>
    );
  };

  const getUrgencyBadge = (urgency: string) => {
    const styles: Record<string, string> = {
      normale: 'bg-green-100 text-green-800',
      urgente: 'bg-orange-100 text-orange-800',
      critique: 'bg-red-100 text-red-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[urgency] || 'bg-gray-100 text-gray-800'}`}>
        {urgency.charAt(0).toUpperCase() + urgency.slice(1)}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const cfg: Record<string, { icon: React.ReactNode; label: string; style: string }> = {
      text_libre: { icon: <Mail className="w-3 h-3" />, label: 'Email', style: 'bg-blue-50 text-blue-700' },
      piece_jointe: { icon: <Paperclip className="w-3 h-3" />, label: 'PJ', style: 'bg-amber-50 text-amber-700' },
      lien_nexxio: { icon: <ExternalLink className="w-3 h-3" />, label: 'Nexxio', style: 'bg-violet-50 text-violet-700' },
    };
    const c = cfg[type] || { icon: null, label: type, style: 'bg-gray-50 text-gray-700' };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium flex items-center gap-1 ${c.style}`}>
        {c.icon} {c.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="w-6 h-6 animate-spin text-orange-500" />
        <span className="ml-2">Chargement...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Demandes d'intervention</h2>
          <p className="text-sm text-gray-500 mt-1">
            Traitement automatique des emails &rarr; Google Sheets &rarr; Synchroteam
          </p>
        </div>
        <div className="flex items-center gap-3">
          {config?.last_check_at && (
            <span className="text-xs text-gray-400">
              Dernière vérification : {new Date(config.last_check_at).toLocaleString('fr-FR')}
            </span>
          )}
          {pendingSheetsCount > 0 && (
            <button
              onClick={retrySheetsSync}
              disabled={syncing}
              className="flex items-center gap-2 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              title={`${pendingSheetsCount} intervention(s) sans ligne Google Sheets`}
            >
              <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
              Resync Sheets ({pendingSheetsCount})
            </button>
          )}
          <button
            onClick={syncNow}
            disabled={syncing || !config?.enabled}
            className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
            {syncing ? 'Synchronisation...' : 'Synchroniser maintenant'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {[
          { id: 'interventions' as const, label: 'Interventions', icon: ClipboardList, count: interventions.length },
          { id: 'config' as const, label: 'Configuration', icon: Settings },
          { id: 'logs' as const, label: 'Historique', icon: Clock },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-orange-500 text-orange-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full text-xs">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Interventions Tab */}
      {activeTab === 'interventions' && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Rechercher (client, adresse, N° TRTP...)"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <select
              value={filterEtat}
              onChange={e => setFilterEtat(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">Tous les états</option>
              <option value="nouveau">Nouveau</option>
              <option value="en_cours">En cours</option>
              <option value="planifie">Planifié</option>
              <option value="termine">Terminé</option>
              <option value="annule">Annulé</option>
              <option value="erreur_validation">Erreur validation</option>
            </select>
            <select
              value={filterUrgency}
              onChange={e => setFilterUrgency(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="all">Toutes les urgences</option>
              <option value="normale">Normale</option>
              <option value="urgente">Urgente</option>
              <option value="critique">Critique</option>
            </select>
          </div>

          {filteredInterventions.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <ClipboardList className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Aucune demande d'intervention</p>
              <p className="text-sm text-gray-400 mt-1">
                {config?.enabled
                  ? 'Les emails seront traités automatiquement'
                  : 'Activez le traitement dans la configuration'}
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">N° TRTP</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Client</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Objet</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">État</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Urgence</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {filteredInterventions.map(intervention => (
                      <tr
                        key={intervention.id}
                        className={`hover:bg-gray-50 cursor-pointer ${
                          selectedIntervention === intervention.id ? 'bg-orange-50' : ''
                        }`}
                        onClick={() => setSelectedIntervention(
                          selectedIntervention === intervention.id ? null : intervention.id
                        )}
                      >
                        <td className="px-4 py-3 text-sm font-mono font-medium text-gray-900">
                          {intervention.numero_trtp || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(intervention.created_at).toLocaleDateString('fr-FR')}
                        </td>
                        <td className="px-4 py-3">{getTypeBadge(intervention.request_type)}</td>
                        <td className="px-4 py-3 text-sm text-gray-900">
                          {intervention.client_name || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-[200px] truncate">
                          {intervention.email_subject}
                        </td>
                        <td className="px-4 py-3">{getEtatBadge(intervention.etat)}</td>
                        <td className="px-4 py-3">{getUrgencyBadge(intervention.urgency)}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            {intervention.synchroteam_job_id && (
                              <span title="Synchroteam" className="text-green-500"><CheckCircle className="w-4 h-4" /></span>
                            )}
                            {intervention.google_sheets_row && (
                              <span title={`Sheets ligne ${intervention.google_sheets_row}`} className="text-blue-500"><CheckCircle className="w-4 h-4" /></span>
                            )}
                            {intervention.nexxio_link && (
                              <span title="Lien Nexxio" className="text-purple-500"><ExternalLink className="w-4 h-4" /></span>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Detail panel */}
          {selectedDetail && (
            <div className="bg-white rounded-lg border p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">
                  {selectedDetail.numero_trtp || 'Détail de l\'intervention'}
                </h3>
                <button
                  onClick={() => setSelectedIntervention(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500 block">Client</span>
                  <span className="font-medium">{selectedDetail.client_name || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">N° BT Client</span>
                  <span className="font-medium">{selectedDetail.numero_bt_client || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">N° Nexxio</span>
                  <span className="font-medium">{selectedDetail.numero_nexxio || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500 block">Intervenant</span>
                  <span className="font-medium">{selectedDetail.assigned_to || 'Non assigné'}</span>
                </div>
              </div>

              {selectedDetail.address && (
                <div className="text-sm">
                  <span className="text-gray-500 block">Adresse</span>
                  <span>{selectedDetail.address}</span>
                </div>
              )}

              {selectedDetail.description && (
                <div className="text-sm">
                  <span className="text-gray-500 block">Description</span>
                  <p className="mt-1 bg-gray-50 rounded p-3 whitespace-pre-wrap text-gray-700">
                    {selectedDetail.description.substring(0, 500)}
                  </p>
                </div>
              )}

              <div className="text-sm">
                <span className="text-gray-500 block mb-1">Email original</span>
                <div className="bg-gray-50 rounded p-3">
                  <p><strong>De :</strong> {selectedDetail.email_from}</p>
                  <p><strong>Objet :</strong> {selectedDetail.email_subject}</p>
                  <p><strong>Date :</strong> {new Date(selectedDetail.email_date).toLocaleString('fr-FR')}</p>
                </div>
              </div>

              <div className="flex gap-3 flex-wrap text-sm">
                {selectedDetail.attachment_url && (
                  <span className="flex items-center gap-1 text-amber-600">
                    <Paperclip className="w-4 h-4" /> {selectedDetail.attachment_name || 'Pièce jointe'}
                  </span>
                )}
                {selectedDetail.nexxio_link && (
                  <a
                    href={selectedDetail.nexxio_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-purple-600 hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" /> Ouvrir dans Nexxio
                  </a>
                )}
                {selectedDetail.synchroteam_job_id && (
                  <span className="flex items-center gap-1 text-green-600">
                    <CheckCircle className="w-4 h-4" /> Synchroteam: {selectedDetail.synchroteam_job_id}
                  </span>
                )}
                {selectedDetail.google_sheets_row && (
                  <span className="flex items-center gap-1 text-blue-600">
                    <CheckCircle className="w-4 h-4" /> Sheets ligne {selectedDetail.google_sheets_row}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Configuration Tab */}
      {activeTab === 'config' && (
        <div className="space-y-6">
          {/* Boîtes mail */}
          <div className="bg-white rounded-lg border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Mail className="w-5 h-5 text-red-500" /> Boîtes mail à surveiller
              </h3>
              <button
                onClick={() => setShowAddSource(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600"
              >
                <Plus className="w-4 h-4" /> Ajouter une boîte
              </button>
            </div>

            {emailSources.length === 0 && !showAddSource && (
              <p className="text-gray-400 text-sm text-center py-4">
                Aucune boîte mail configurée. Ajoutez-en une pour commencer.
              </p>
            )}

            {/* Liste des boîtes existantes */}
            <div className="space-y-3">
              {emailSources.map(source => (
                <div key={source.id} className={`border rounded-lg p-4 ${source.enabled ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Mail className={`w-4 h-4 ${source.enabled ? 'text-red-500' : 'text-gray-400'}`} />
                      <div>
                        <span className="font-medium text-sm">{source.label}</span>
                        <span className="text-gray-500 text-sm ml-2">{source.gmail_email}</span>
                        <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded ml-2">
                          {source.imap_host === 'imap.gmail.com' ? 'Gmail' : source.imap_host === 'imap.hostinger.com' ? 'Hostinger' : source.imap_host?.replace('imap.', '') || 'Gmail'}
                        </span>
                        {source.default_client_name && (
                          <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded ml-2">
                            Client: {source.default_client_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {source.last_error && (
                        <span title={source.last_error} className="text-red-500"><AlertCircle className="w-4 h-4" /></span>
                      )}
                      {source.last_check_at && (
                        <span className="text-xs text-gray-400" title="Dernière vérification">
                          {new Date(source.last_check_at).toLocaleString('fr-FR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      )}
                      <button
                        onClick={() => toggleEmailSource(source.id, !source.enabled)}
                        className="p-1 hover:bg-gray-100 rounded"
                        title={source.enabled ? 'Désactiver' : 'Activer'}
                      >
                        {source.enabled ? <Eye className="w-4 h-4 text-green-600" /> : <EyeOff className="w-4 h-4 text-gray-400" />}
                      </button>
                      <button
                        onClick={() => deleteEmailSource(source.id)}
                        className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Formulaire d'ajout */}
            {showAddSource && (
              <div className="mt-4 border border-orange-200 rounded-lg p-4 bg-orange-50">
                <h4 className="text-sm font-semibold mb-3">Nouvelle boîte mail</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Libellé</label>
                    <input
                      type="text"
                      value={newSource.label}
                      onChange={e => setNewSource({ ...newSource, label: e.target.value })}
                      placeholder="Ex: Boîte Enedis, Boîte principale..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Fournisseur</label>
                    <select
                      value={newSource.provider}
                      onChange={e => {
                        const p = EMAIL_PROVIDERS[e.target.value];
                        setNewSource({
                          ...newSource,
                          provider: e.target.value,
                          imap_host: p.imap_host,
                          imap_port: p.imap_port,
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    >
                      {Object.entries(EMAIL_PROVIDERS).map(([key, val]) => (
                        <option key={key} value={key}>{val.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Adresse email</label>
                    <input
                      type="email"
                      value={newSource.gmail_email}
                      onChange={e => setNewSource({ ...newSource, gmail_email: e.target.value })}
                      placeholder="interventions@votre-domaine.com"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Mot de passe {newSource.provider === 'gmail' ? "d'application" : 'email'}
                      {newSource.provider === 'gmail' && (
                        <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noopener noreferrer" className="ml-1 text-blue-500 hover:underline text-xs">(Obtenir)</a>
                      )}
                    </label>
                    <input
                      type="password"
                      value={newSource.gmail_app_password}
                      onChange={e => setNewSource({ ...newSource, gmail_app_password: e.target.value })}
                      placeholder={newSource.provider === 'gmail' ? 'xxxx xxxx xxxx xxxx' : 'Mot de passe du compte email'}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  {newSource.provider === 'custom' && (
                    <>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Serveur IMAP</label>
                        <input
                          type="text"
                          value={newSource.imap_host}
                          onChange={e => setNewSource({ ...newSource, imap_host: e.target.value })}
                          placeholder="imap.votre-fournisseur.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Port IMAP</label>
                        <input
                          type="number"
                          value={newSource.imap_port}
                          onChange={e => setNewSource({ ...newSource, imap_port: parseInt(e.target.value) || 993 })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Dossier à surveiller</label>
                    <input
                      type="text"
                      value={newSource.gmail_label}
                      onChange={e => setNewSource({ ...newSource, gmail_label: e.target.value })}
                      placeholder="INBOX"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Client par défaut (optionnel)</label>
                    <input
                      type="text"
                      value={newSource.default_client_name}
                      onChange={e => setNewSource({ ...newSource, default_client_name: e.target.value })}
                      placeholder="Nom du client associé à cette boîte mail"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                    <p className="text-xs text-gray-400 mt-1">Si tous les emails de cette boîte viennent du même client</p>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-3">
                  <button
                    onClick={() => setShowAddSource(false)}
                    className="px-3 py-1.5 text-gray-600 text-sm hover:bg-gray-100 rounded-lg"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={addEmailSource}
                    className="px-4 py-1.5 bg-orange-500 text-white text-sm rounded-lg hover:bg-orange-600"
                  >
                    Ajouter
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Google Sheets */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-600" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
                <path d="M7 7h4v4H7zm6 0h4v4h-4zm-6 6h4v4H7zm6 0h4v4h-4z"/>
              </svg>
              Google Sheets — Tableau de suivi des BT
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ID du Google Sheets</label>
                <input
                  type="text"
                  value={formData.google_sheets_id}
                  onChange={e => setFormData({ ...formData, google_sheets_id: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GID de la feuille</label>
                <input
                  type="text"
                  value={formData.google_sheets_gid}
                  onChange={e => setFormData({ ...formData, google_sheets_gid: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Clé de service Google (JSON)
                </label>
                <textarea
                  value={formData.google_service_account_json}
                  onChange={e => setFormData({ ...formData, google_service_account_json: e.target.value })}
                  placeholder={config?.google_service_account_json ? 'Clé déjà configurée (coller une nouvelle pour remplacer)' : '{"type": "service_account", "project_id": "...", ...}'}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Créez un compte de service Google Cloud avec accès au Sheets, puis collez le JSON de la clé
                </p>
              </div>
            </div>
          </div>

          {/* Synchroteam */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-blue-500" /> Synchroteam
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Domaine Synchroteam</label>
                <input
                  type="text"
                  value={formData.synchroteam_domain}
                  onChange={e => setFormData({ ...formData, synchroteam_domain: e.target.value })}
                  placeholder="votre-domaine"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Clé API</label>
                <input
                  type="password"
                  value={formData.synchroteam_api_key}
                  onChange={e => setFormData({ ...formData, synchroteam_api_key: e.target.value })}
                  placeholder={config?.synchroteam_api_key ? '••••••••' : 'Votre clé API Synchroteam'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto_create_synchroteam"
                  checked={formData.auto_create_synchroteam}
                  onChange={e => setFormData({ ...formData, auto_create_synchroteam: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="auto_create_synchroteam" className="text-sm text-gray-700">
                  Créer automatiquement les jobs dans Synchroteam
                </label>
              </div>
            </div>
          </div>

          {/* Nexxio */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <ExternalLink className="w-5 h-5 text-purple-500" /> Nexxio
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Identifiant</label>
                <input
                  type="text"
                  value={formData.nexxio_username}
                  onChange={e => setFormData({ ...formData, nexxio_username: e.target.value })}
                  placeholder="Votre identifiant Nexxio"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Mot de passe</label>
                <input
                  type="password"
                  value={formData.nexxio_password}
                  onChange={e => setFormData({ ...formData, nexxio_password: e.target.value })}
                  placeholder={config?.nexxio_password ? '••••••••' : 'Votre mot de passe Nexxio'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">URL de base</label>
                <input
                  type="url"
                  value={formData.nexxio_base_url}
                  onChange={e => setFormData({ ...formData, nexxio_base_url: e.target.value })}
                  placeholder="https://app.nexxio.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Utilisé pour naviguer automatiquement dans Nexxio et extraire les données d'intervention.
              Quand l'API Nexxio sera disponible, ces identifiants seront utilisés pour l'API.
            </p>
          </div>

          {/* General settings */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Settings className="w-5 h-5 text-gray-500" /> Paramètres généraux
            </h3>
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="enabled"
                  checked={formData.enabled}
                  onChange={e => setFormData({ ...formData, enabled: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="enabled" className="text-sm font-medium text-gray-700">
                  Activer le traitement automatique des emails
                </label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="auto_sync"
                  checked={formData.auto_sync_enabled}
                  onChange={e => setFormData({ ...formData, auto_sync_enabled: e.target.checked })}
                  className="rounded border-gray-300"
                />
                <label htmlFor="auto_sync" className="text-sm font-medium text-gray-700">
                  Synchronisation automatique (cron)
                </label>
              </div>
              <div className="w-48">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Intervalle de vérification (minutes)
                </label>
                <input
                  type="number"
                  min={5}
                  max={60}
                  value={formData.check_interval_minutes}
                  onChange={e => setFormData({ ...formData, check_interval_minutes: parseInt(e.target.value) || 15 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email de notification (validation Synchroteam)
                </label>
                <input
                  type="email"
                  value={formData.notification_email}
                  onChange={e => setFormData({ ...formData, notification_email: e.target.value })}
                  placeholder="trtp@tr-tp.com"
                  className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg text-sm"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Un email sera envoyé à cette adresse pour chaque nouvelle intervention créée
                </p>
              </div>
            </div>
          </div>

          {/* Save button */}
          <div className="flex justify-end">
            <button
              onClick={saveConfig}
              disabled={saving}
              className="px-6 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? 'Sauvegarde...' : 'Sauvegarder la configuration'}
            </button>
          </div>
        </div>
      )}

      {/* Logs Tab */}
      {activeTab === 'logs' && (
        <div className="space-y-4">
          {logs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg border">
              <Clock className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-500">Aucun historique de synchronisation</p>
            </div>
          ) : (
            <div className="bg-white rounded-lg border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Statut</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Emails</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Interventions</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Sheets</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Synchroteam</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Durée</th>
                      <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Erreur</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {logs.map(log => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {new Date(log.created_at).toLocaleString('fr-FR')}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-1 rounded text-xs ${
                            log.sync_type === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700'
                          }`}>
                            {log.sync_type === 'auto' ? 'Auto' : 'Manuel'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {log.status === 'success' && <CheckCircle className="w-5 h-5 text-green-500" />}
                          {log.status === 'partial' && <AlertCircle className="w-5 h-5 text-yellow-500" />}
                          {log.status === 'failed' && <XCircle className="w-5 h-5 text-red-500" />}
                        </td>
                        <td className="px-4 py-3 text-sm text-center">{log.emails_found}</td>
                        <td className="px-4 py-3 text-sm text-center">{log.interventions_created}</td>
                        <td className="px-4 py-3 text-sm text-center">{log.sheets_updated}</td>
                        <td className="px-4 py-3 text-sm text-center">{log.synchroteam_created}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {log.sync_duration_ms ? `${(log.sync_duration_ms / 1000).toFixed(1)}s` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-red-500 max-w-[200px] truncate" title={log.error_message || ''}>
                          {log.error_message || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
