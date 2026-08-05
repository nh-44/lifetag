import { ShieldCheck, ShieldAlert, ShieldX, Shield, Loader2 } from 'lucide-react';

export type TrustStatus =
  | 'authority-certified'
  | 'self-signed'
  | 'failed'
  | 'loading'
  | 'server-verified';

interface TrustBadgeProps {
  status: TrustStatus;
  errorMessage?: string;
}

const config: Record<Exclude<TrustStatus, 'loading'>, {
  icon: typeof ShieldCheck;
  label: string;
  description: string;
  bgClass: string;
  borderClass: string;
  iconClass: string;
  textClass: string;
}> = {
  'authority-certified': {
    icon: ShieldCheck,
    label: 'Authority Certified',
    description:
      "This tag's identity has been verified by a trusted Healthcare Authority.",
    bgClass: 'bg-green-50',
    borderClass: 'border-green-500',
    iconClass: 'text-green-600',
    textClass: 'text-green-800',
  },
  'self-signed': {
    icon: ShieldAlert,
    label: 'Self-Signed / Unverified Key',
    description:
      'Patient signature is valid, but the key has not been certified by a Healthcare Authority.',
    bgClass: 'bg-amber-50',
    borderClass: 'border-amber-500',
    iconClass: 'text-amber-600',
    textClass: 'text-amber-800',
  },
  failed: {
    icon: ShieldX,
    label: 'Verification Failed',
    description:
      'Tag integrity check failed — data may have been tampered with. Treat information with caution.',
    bgClass: 'bg-red-50',
    borderClass: 'border-red-500',
    iconClass: 'text-red-600',
    textClass: 'text-red-800',
  },
  'server-verified': {
    icon: Shield,
    label: 'Verified via Server',
    description:
      'Data was retrieved from the LifeTag server. Authority registration status shown below.',
    bgClass: 'bg-blue-50',
    borderClass: 'border-blue-500',
    iconClass: 'text-blue-600',
    textClass: 'text-blue-800',
  },
};

const TrustBadge = ({ status, errorMessage }: TrustBadgeProps) => {
  if (status === 'loading') {
    return (
      <div className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 bg-gray-50 mb-6 animate-pulse">
        <Loader2 className="h-6 w-6 text-gray-400 animate-spin" />
        <div>
          <p className="text-sm font-medium text-gray-500">
            Verifying tag integrity…
          </p>
        </div>
      </div>
    );
  }

  const { icon: Icon, label, description, bgClass, borderClass, iconClass, textClass } =
    config[status];

  return (
    <div
      id={`trust-badge-${status}`}
      className={`flex items-start gap-3 p-4 rounded-lg border-l-4 ${borderClass} ${bgClass} mb-6`}
    >
      <Icon className={`h-6 w-6 mt-0.5 flex-shrink-0 ${iconClass}`} />
      <div>
        <p className={`text-sm font-semibold ${textClass}`}>{label}</p>
        <p className={`text-sm mt-0.5 ${textClass} opacity-80`}>
          {errorMessage || description}
        </p>
      </div>
    </div>
  );
};

export default TrustBadge;
