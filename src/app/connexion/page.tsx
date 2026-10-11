import type { Metadata } from 'next';
import Image from 'next/image';
import { redirect } from 'next/navigation';
import { BellRing, LineChart, Sparkles } from 'lucide-react';
import { getCurrentUser } from '@/server/auth/session';
import { LoginCard } from './login-form';
import { Logo } from '@/components/shell/logo';

export const metadata: Metadata = { title: 'Connexion' };

/**
 * Écran de connexion.
 *
 * Volontairement **toujours sombre**, indépendamment du thème choisi dans
 * l'application : c'est la première image de KS Plastico Demo, elle doit être la même
 * pour tout le monde. Les couleurs sont donc écrites ici plutôt que reprises
 * des jetons clair/sombre.
 *
 * Trois plans, de l'arrière vers l'avant :
 *   1. le fond nuit et sa trame de points,
 *   2. la photo de l'atelier, fondue par des dégradés sur ses deux bords,
 *   3. le discours de marque à gauche, la carte de connexion à droite.
 */

const FEATURES = [
  {
    icon: LineChart,
    title: 'Vue instantanée',
    description: 'Tableaux de bord en temps réel sur vos opérations et indicateurs clés.',
  },
  {
    icon: BellRing,
    title: 'Alertes prioritaires',
    description: 'Soyez notifié des écarts et anomalies qui méritent votre attention.',
  },
  {
    icon: Sparkles,
    title: 'Décisions assistées',
    description: 'Des recommandations basées sur vos données pour décider plus vite et mieux.',
  },
];

export default async function LoginPage() {
  if (await getCurrentUser()) redirect('/');

  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#050a12] text-white">
      <BackdropLayer />

      <header className="relative z-10 px-6 pt-7 sm:px-10 sm:pt-9">
        <Logo />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-[1480px] flex-1 items-center px-6 py-10 sm:px-10">
        <div className="grid w-full items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,524px)] lg:gap-16">
          <section className="order-2 max-w-[30rem] lg:order-1">
            <p className="text-[0.6875rem] font-semibold tracking-[0.24em] text-[#5b9dff] uppercase">
              Factory Intelligence
            </p>

            <h1 className="mt-5 text-[2.25rem] leading-[1.08] font-bold tracking-tight text-white sm:text-[2.75rem] lg:text-[3.5rem]">
              Pilotez votre usine
              <br />
              <span className="text-[#4d8dff]">en temps réel.</span>
            </h1>

            <span aria-hidden className="mt-7 block h-[3px] w-14 rounded-full bg-[#2563eb]" />

            <p className="mt-7 text-[0.9375rem] leading-relaxed text-white/55">
              KS Plastico Demo centralise vos commandes, vos presses, vos stocks et vos équipes
              pour vous donner une visibilité instantanée et fiable.
            </p>

            <ul className="mt-10 space-y-6">
              {FEATURES.map((feature) => (
                <li key={feature.title} className="flex items-start gap-4">
                  <span className="grid size-11 shrink-0 place-items-center rounded-[0.875rem] border border-[#2563eb]/35 bg-[#2563eb]/12 text-[#5b9dff]">
                    <feature.icon className="size-[18px]" strokeWidth={2} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[0.9375rem] font-semibold text-white">
                      {feature.title}
                    </span>
                    <span className="mt-1 block max-w-[19rem] text-[0.8125rem] leading-relaxed text-white/50">
                      {feature.description}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="order-1 lg:order-2">
            <LoginCard />
          </div>
        </div>
      </main>

      <footer className="relative z-10 flex flex-col items-center gap-3 px-6 pt-4 pb-7 text-[0.75rem] text-white/35 sm:px-10 md:flex-row md:justify-between">
        <p>KS Plastico Demo © {new Date().getFullYear()} · Données fictives.</p>
        <p className="text-white/30">L’IA recommande. L’humain décide.</p>
      </footer>
    </div>
  );
}

/**
 * Arrière-plan : trame de points, photo de l'atelier, dégradés de fondu.
 *
 * La photo est masquée en dessous de `lg` : sur un écran d'atelier étroit,
 * elle n'apporterait rien et coûterait un téléchargement.
 */
function BackdropLayer() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Trame de points, très discrète. */}
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage: 'radial-gradient(rgb(96 135 205 / 0.16) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
        }}
      />

      {/* Photo de l'atelier — cadrée au centre, ses bords fondus dans la nuit. */}
      <div className="absolute inset-y-0 left-[19%] hidden w-[56%] lg:block">
        <Image
          src="/images/connexion_bg.png"
          alt=""
          fill
          priority
          quality={75}
          sizes="(min-width: 1024px) 56vw, 0px"
          /*
           * Cadrage centré : la photo est une perspective d'allée, son point
           * de fuite est au milieu. Le décaler couperait l'opérateur, qui est
           * le seul élément humain de l'image.
           */
          className="object-cover object-center opacity-[0.75]"
        />
        {/*
          Trois voiles, chacun avec un rôle distinct :
            · le dégradé horizontal fond les bords gauche et droit dans la
              nuit, pour que la photo n'ait pas d'arête franche ;
            · le vertical fait de même en haut et en bas ;
            · le voile plat, lui, ne sert qu'à garder le texte lisible. Il est
              volontairement léger — trop dense, il éteignait la photo au
              point qu'on n'y distinguait plus l'atelier.
        */}
        <div className="absolute inset-0 bg-gradient-to-r from-[#050a12] via-[#050a12]/25 to-[#050a12]" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050a12] via-transparent to-[#050a12]" />
        <div className="absolute inset-0 bg-[#050a12]/20" />
      </div>

      {/* Halo bleu derrière la carte, comme une lueur d'écran. */}
      <div className="absolute top-[-12%] right-[-6%] size-[620px] rounded-full bg-[#2563eb]/12 blur-[140px]" />
    </div>
  );
}
