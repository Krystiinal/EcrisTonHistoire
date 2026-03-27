# EcrisTonHistoire — v0.1.2

## Nouveautés

### Page d'accueil
- Nouvel écran d'accueil affichant tous tes projets sous forme de cartes
- Résumé global : nombre de projets, mots écrits et tomes
- Création d'un nouveau projet directement depuis l'accueil
- Accès rapide à un projet en un clic

### Statistiques d'écriture
- Nouvelle section **Statistiques** dans la navigation
- Compteur de mots du jour, de la semaine et du mois
- Graphique en barres des 30 derniers jours d'activité
- Objectifs personnalisables (journalier, hebdomadaire, mensuel) avec barre de progression

### Éditeur enrichi
- **Styles de paragraphe** : Normal, Titres 1 à 6, Citation, Code — via menu déroulant dans la barre d'outils
- **Exposant** et **indice**
- **Listes de cases à cocher** (todo list)
- **Liens hypertexte** : insertion et suppression via popup
- **Insertion d'image** dans le corps du texte
- **Caractères spéciaux** : guillemets français, tirets, ellipse, symboles typographiques, fractions, etc.
- **Saut de page** explicite, visible dans l'éditeur et exporté dans le `.docx`
- Fermeture automatique des menus déroulants au clic extérieur

### Interface & navigation
- Nouvelle sidebar avec **icônes SVG** à la place des emojis
- Bouton **Accueil** dans la sidebar pour revenir à la liste des projets
- Nouveau logo **plume** sur l'écran d'accueil et dans la barre des tâches
- Refonte complète des styles CSS : variables unifiées, scrollbars, polices

### Technique
- Mise à jour vers **Electron 35.7.5**
- Icône de l'application (`icon.ico`) mise à jour — plume calligraphique en 7 tailles (16 à 256 px)
- Intégration de **Tailwind CSS v4** pour le système de thème

---

## Corrections

- Variable CSS `--warning` manquante dans la vue Relations → remplacée par la valeur directe
- Référence au projet précédent non réinitialisée lors de la suppression → retour automatique à l'accueil
- Icône de mise à jour (×) remplacée par une icône SVG cohérente

---

## Notes d'installation

Télécharge le fichier `.msi` ci-dessous et lance l'installation.
Tes données existantes sont conservées — aucune action manuelle nécessaire.
