/** @type {import('tailwindcss').Config} */
export default {
    darkMode: ["class"],
    content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			claw: {
  				50: '#fef3f2', 100: '#fee4e2', 200: '#ffccc7', 300: '#ffa8a0',
  				400: '#ff7a6b', 500: '#f94d3a', 600: '#e63024', 700: '#c1241a',
  				800: '#a02119', 900: '#84221c', 950: '#480d09',
  			},
  			dark: {
  				900: '#0a0a0b', 800: '#111113', 700: '#1a1a1d',
  				600: '#242428', 500: '#2e2e33', 400: '#3d3d44',
  			},
  			app: {
  				bg: 'var(--app-bg)',
  				surface: 'var(--app-surface)',
  				elevated: 'var(--app-elevated)',
  				border: 'var(--app-border)',
  				text: 'var(--app-text)',
  				muted: 'var(--app-muted)',
  				hover: 'var(--app-hover)',
  			},
  		},
  		fontFamily: {
  			sans: ['SF Pro Display', '-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'sans-serif'],
  			mono: ['SF Mono', 'JetBrains Mono', 'Fira Code', 'Menlo', 'monospace'],
  		},
  		animation: {
  			'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  			'glow': 'glow 2s ease-in-out infinite alternate',
  			'slide-up': 'slideUp 0.3s ease-out',
  			'fade-in': 'fadeIn 0.2s ease-out',
  		},
  		keyframes: {
  			glow: { '0%': { boxShadow: '0 0 5px rgba(249, 77, 58, 0.5)' }, '100%': { boxShadow: '0 0 20px rgba(249, 77, 58, 0.8)' } },
  			slideUp: { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
  			fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
  		},
  		boxShadow: {
  			'glow-claw': '0 0 30px rgba(249, 77, 58, 0.3)',
  			'glow-green': '0 0 30px rgba(74, 222, 128, 0.3)',
  		},
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
