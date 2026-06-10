import { AlertTriangle, Info, ShieldAlert, X } from 'lucide-react';
import { useState } from 'react';
export interface AlertBannerProps {
    title: string;
    message: string;
    severity: 'info' | 'warning' | 'severe';
}

const AlertBanner = ({ title, message, severity }: AlertBannerProps) => {
    const [isVisible, setIsVisible] = useState(true);

    if (!isVisible) return null;
    const config = {
        info: {
            bg: '#eff6ff', border: '#bfdbfe', text: '#1e40af', icon: <Info size={24} color="#2563eb" />
        },
        warning: {
            bg: '#fefce8', border: '#fef08a', text: '#854d0e', icon: <AlertTriangle size={24} color="#ca8a04" />
        },
        severe: {
            bg: '#fef2f2', border: '#fecaca', text: '#991b1b', icon: <ShieldAlert size={24} color="#dc2626" />
        }
    };

    const currentConfig = config[severity];

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            backgroundColor: currentConfig.bg,
            border: `1px solid ${currentConfig.border}`,
            color: currentConfig.text,
            padding: '15px 20px',
            borderRadius: '8px',
            marginBottom: '20px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
        }}>
            <div style={{ display: 'flex', gap: '15px' }}>
                <div style={{ marginTop: '2px' }}>
                    {currentConfig.icon}
                </div>
                <div>
                    <h4 style={{ margin: '0 0 5px 0', fontSize: '16px', fontWeight: 'bold' }}>
                        {title}
                    </h4>
                    <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.4' }}>
                        {message}
                    </p>
                </div>
            </div>
            <button 
                onClick={() => setIsVisible(false)}
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: currentConfig.text,
                    opacity: 0.6,
                    padding: '5px'
                }}
            >
                <X size={20} />
            </button>
        </div>
    );
};

export default AlertBanner;