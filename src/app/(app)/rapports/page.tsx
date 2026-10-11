import { permanentRedirect } from 'next/navigation';

/**
 * Ancienne adresse du rapport quotidien — conservée en redirection.
 * Elle circulait par lien direct puisqu'elle ne figurait dans aucun menu :
 * la supprimer casserait les seuls chemins qui y menaient.
 */
export default function DailyReportPage() {
  permanentRedirect('/analyse?vue=rapport');
}
