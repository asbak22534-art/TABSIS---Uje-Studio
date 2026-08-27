import React from 'react';

export const Skeleton: React.FC<{ className?: string }> = ({ className = '' }) => {
  return <div className={`animate-pulse bg-slate-200/80 rounded-lg ${className}`} />;
};

export const DashboardSkeleton: React.FC = () => {
  return (
    <div className="space-y-5 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex justify-between items-center">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>

      {/* Main Balance Card Skeleton */}
      <div className="bg-slate-200/90 rounded-2xl h-44 w-full" />

      {/* Today flow & quick counts */}
      <div className="grid grid-cols-2 gap-3.5">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>

      {/* Quick Actions Grid */}
      <div className="grid grid-cols-4 gap-2.5">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>

      {/* Recent Transactions List */}
      <div className="space-y-2.5 pt-2">
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    </div>
  );
};

export const StudentListSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-xl" />
        <Skeleton className="h-11 w-28 rounded-xl" />
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
        <Skeleton className="h-8 w-20 rounded-full" />
      </div>
      <div className="space-y-3 pt-2">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
    </div>
  );
};

export const ReportSkeleton: React.FC = () => {
  return (
    <div className="space-y-4 animate-pulse">
      <Skeleton className="h-32 rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </div>
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
};

export const SettingsSkeleton: React.FC = () => {
  return (
    <div className="space-y-5 animate-pulse max-w-3xl mx-auto">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-60" />
      </div>
      <Skeleton className="h-48 rounded-2xl" />
      <Skeleton className="h-48 rounded-2xl" />
    </div>
  );
};

export const TransactionSkeleton: React.FC = () => {
  return (
    <div className="space-y-5 animate-pulse max-w-xl mx-auto">
      <Skeleton className="h-10 w-48 rounded-xl" />
      <Skeleton className="h-44 rounded-2xl" />
      <Skeleton className="h-64 rounded-2xl" />
    </div>
  );
};

export const DelayedRender: React.FC<{
  delay?: number;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}> = ({ delay = 200, children, fallback = null }) => {
  const [show, setShow] = React.useState(false);

  React.useEffect(() => {
    const timer = setTimeout(() => setShow(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  if (!show) return <>{fallback}</>;
  return <>{children}</>;
};

