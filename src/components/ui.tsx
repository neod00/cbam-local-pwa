import clsx from 'clsx';
import type { LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral' | 'pending';

const badgeToneClass: Record<StatusTone, string> = {
    success: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    info: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    warning: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    danger: 'bg-red-50 text-red-700 ring-red-600/20',
    neutral: 'bg-slate-50 text-slate-700 ring-slate-600/20',
    pending: 'bg-teal-50 text-teal-700 ring-teal-600/20',
};

const buttonVariantClass = {
    primary: 'bg-teal-700 text-white hover:bg-teal-600 disabled:bg-slate-300',
    secondary: 'border border-slate-200 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
    ghost: 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
    danger: 'border border-red-200 bg-white text-red-700 hover:bg-red-50 disabled:text-red-300',
};

export function PageHeader({
    title,
    description,
    eyebrow,
    actions,
}: {
    title: string;
    description?: string;
    eyebrow?: string;
    actions?: ReactNode;
}) {
    return (
        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
                {eyebrow && <p className="break-words text-xs font-semibold uppercase tracking-wide text-teal-700">{eyebrow}</p>}
                <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-slate-950">{title}</h1>
                {description && <p className="mt-2 max-w-3xl break-words text-sm leading-6 text-slate-600">{description}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}

export function SectionCard({
    title,
    description,
    children,
    className,
    actions,
}: {
    title?: string;
    description?: string;
    children: ReactNode;
    className?: string;
    actions?: ReactNode;
}) {
    return (
        <section className={clsx('w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm', className)}>
            {(title || description || actions) && (
                <div className="mb-5 flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        {title && <h2 className="break-words text-base font-semibold text-slate-950">{title}</h2>}
                        {description && <p className="mt-1 break-words text-sm leading-6 text-slate-600">{description}</p>}
                    </div>
                    {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
                </div>
            )}
            {children}
        </section>
    );
}

export function StatCard({
    label,
    value,
    helper,
    icon: Icon,
    tone = 'info',
}: {
    label: string;
    value: ReactNode;
    helper?: string;
    icon?: LucideIcon;
    tone?: StatusTone;
}) {
    const iconClass: Record<StatusTone, string> = {
        success: 'bg-emerald-50 text-emerald-700',
        info: 'bg-blue-50 text-blue-700',
        warning: 'bg-amber-50 text-amber-700',
        danger: 'bg-red-50 text-red-700',
        neutral: 'bg-slate-50 text-slate-700',
        pending: 'bg-teal-50 text-teal-700',
    };

    return (
        <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="break-words text-sm font-medium text-slate-500">{label}</p>
                    <div className="mt-2 break-words text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
                </div>
                {Icon && (
                    <div className={clsx('flex-none rounded-xl p-2.5', iconClass[tone])}>
                        <Icon className="h-5 w-5" />
                    </div>
                )}
            </div>
            {helper && <p className="mt-3 break-words text-sm text-slate-500">{helper}</p>}
        </div>
    );
}

export function StatusBadge({ children, tone = 'neutral' }: { children: ReactNode; tone?: StatusTone }) {
    return (
        <span
            className={clsx(
                'inline-flex max-w-full items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                badgeToneClass[tone]
            )}
        >
            <span className="min-w-0 break-words">{children}</span>
        </span>
    );
}

export function Button({
    variant = 'primary',
    className,
    ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: keyof typeof buttonVariantClass;
}) {
    return (
        <button
            {...props}
            className={clsx(
                'inline-flex min-h-10 max-w-full items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold shadow-sm transition disabled:cursor-not-allowed',
                buttonVariantClass[variant],
                className
            )}
        />
    );
}

export function DataTable({
    children,
    className,
}: {
    children: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx('min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
            <div className="overflow-x-auto">{children}</div>
        </div>
    );
}

export function ActionItemCard({
    title,
    description,
    badge,
    action,
    className,
}: {
    title: string;
    description: string;
    badge?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx('w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4', className)}>
            <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <h3 className="min-w-0 break-words text-sm font-semibold text-slate-950">{title}</h3>
                        {badge}
                    </div>
                    <p className="mt-2 break-words text-sm leading-6 text-slate-600">{description}</p>
                </div>
                {action && <div className="flex flex-none flex-wrap gap-2">{action}</div>}
            </div>
        </div>
    );
}

export function EmptyState({
    title,
    description,
    action,
    className,
}: {
    title: string;
    description: string;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div className={clsx('flex min-w-0 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-5 py-8 text-center', className)}>
            <h2 className="break-words text-sm font-semibold text-slate-950">{title}</h2>
            <p className="mt-2 max-w-xl break-words text-sm leading-6 text-slate-600">{description}</p>
            {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
        </div>
    );
}

export function FormSection({
    title,
    description,
    children,
    className,
}: {
    title: string;
    description?: string;
    children: ReactNode;
    className?: string;
}) {
    return (
        <fieldset className={clsx('min-w-0 rounded-2xl border border-slate-200 bg-white p-4', className)}>
            <legend className="px-1 text-sm font-semibold text-slate-950">{title}</legend>
            {description && <p className="mt-1 break-words text-xs leading-5 text-slate-600">{description}</p>}
            <div className="mt-4 grid min-w-0 grid-cols-1 gap-4 md:grid-cols-3">{children}</div>
        </fieldset>
    );
}
