# EcrisTonHistoire

Application de bureau pour l'écriture narrative — gestion de projets, chapitres, personnages, chronologie et relations entre personnages.

Développée par **Krystiinal**.

---

## Téléchargement et installation

1. Va sur la page [**Releases**](../../releases) du dépôt
2. Télécharge le fichier `EcrisTonHistoire-x.x.x.msi`
3. Double-clique sur le fichier téléchargé
4. Suis les étapes de l'assistant d'installation
5. Lance **EcrisTonHistoire** depuis le menu Démarrer ou le raccourci bureau

> **Note Windows** : si Windows affiche un avertissement SmartScreen ("Application inconnue"), clique sur **"Informations complémentaires"** puis **"Exécuter quand même"**. Cela est normal pour une application sans certificat de signature officiel.

---

## Fonctionnalités

- **Projets** — synopsis, notes, stade d'avancement, comptage de mots global
- **Écriture** — éditeur de texte riche par chapitres avec sauvegarde automatique
- **Liminaires** — dédicace, épigraphe, avant-propos, etc.
- **Personnages** — fiches détaillées, traits, arc narratif, images d'inspiration
- **Relations** — liens entre personnages
- **Chronologie** — timeline des événements du récit
- **Export Word** — export `.docx` de tous les chapitres
- **Sauvegardes** — backups manuels et automatiques de la base de données

---

## Données personnelles

Toutes tes données sont stockées **localement** sur ta machine, dans ton dossier utilisateur :

```
C:\Users\<ton nom>\AppData\Roaming\EcrisTonHistoire\
```

Elles ne sont jamais envoyées sur internet.

---

## Développement

### Prérequis

- [Node.js](https://nodejs.org/) v18 ou supérieur

### Lancer en développement

```bash
npm install
npm run dev
```

### Générer l'installeur

Depuis un terminal **administrateur** :

```bash
npm run dist
```

L'installeur `.msi` sera généré dans le dossier `dist-electron/`.
