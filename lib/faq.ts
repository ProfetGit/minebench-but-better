export interface FaqLink {
  label: string;
  href: string;
}

export interface FaqItem {
  id: string;
  question: string;
  navLabel?: string;
  answer: readonly string[];
  links?: readonly FaqLink[];
}

export interface FaqSection {
  id: string;
  title: string;
  items: readonly FaqItem[];
}

export const FAQ_SECTIONS: readonly FaqSection[] = [
  {
    id: "about",
    title: "About MineBench",
    items: [
      {
        id: "what-is-minebench",
        question: "What is MineBench?",
        navLabel: "What is MineBench?",
        answer: [
          "MineBench generates Minecraft builds you can actually put up in survival.",
          "You describe a build, a model writes a short program that describes its structure, and MineBench compiles that program, resolves it into blocks, checks it, renders it, and exports it.",
          "The result is a build you can edit, re-palette and cost out, rather than a fixed pile of blocks.",
        ],
      },
      {
        id: "how-are-builds-generated",
        question: "How are the builds generated?",
        navLabel: "How builds are generated",
        answer: [
          "The model does not place blocks. It writes a program in a small build DSL: a mass with storeys, walls, corners, floors, openings, a roof, and transforms such as mirrorX and repeat.",
          "A deterministic compiler executes that program into a grid of semantic roles, deciding stair facings, slab halves and log axes from the geometry itself.",
          "A palette then maps each role to a concrete block. Nothing before that step has ever seen a Minecraft block id.",
          "Because symmetry and repetition are compiler operations rather than something the model types out twice, they come out exact instead of drifting.",
        ],
        links: [
          {
            label: "DSL reference",
            href: "https://github.com/Ammaar-Alam/minebench/blob/master/docs/dsl.md",
          },
        ],
      },
      {
        id: "why-a-program-instead-of-coordinates",
        question: "Why a program instead of block coordinates?",
        navLabel: "Why a program",
        answer: [
          "Emitting raw coordinates makes error accumulate with the size of the build, drifts symmetry, and produces output nobody can edit afterwards.",
          "A program is short, reviewable, and re-runnable. Editing one number changes the whole build consistently, and the same program can be rendered under any palette.",
        ],
      },
    ],
  },
  {
    id: "palettes",
    title: "Palettes and budgets",
    items: [
      {
        id: "what-is-a-palette",
        question: "What is a palette?",
        navLabel: "Palettes",
        answer: [
          "A palette is a small document mapping each semantic role, such as wall_primary or roof_trim, to a block and optionally a block state.",
          "Swapping a palette re-resolves the existing build. It does not run the model again, so the geometry is identical and only the materials change.",
          "A role can also point at a colour ramp, which is one slot in the palette but several blocks, picked per cell and ordered by perceptual lightness.",
        ],
      },
      {
        id: "how-do-budgets-work",
        question: "How do the cost budgets work?",
        navLabel: "Cost budgets",
        answer: [
          "Every block carries a rough survival acquisition cost, and a build is measured against a cost ceiling and a limit on how many distinct blocks it uses.",
          "This is a budget rather than a blocklist, because a blocklist cannot say that four gold blocks of trim are fine while eight hundred as roofing are not.",
          "Presets ship for early survival, an established base, and creative. Hard include and exclude lists exist as a manual override layered on top.",
        ],
      },
    ],
  },
  {
    id: "output",
    title: "Checks and export",
    items: [
      {
        id: "what-is-checked",
        question: "What does MineBench check before I build it?",
        navLabel: "Validation",
        answer: [
          "Blocks with nothing holding them up, whether the shell encloses a real interior, holes in a surface that were never declared as an opening, and whether mirrored halves still match.",
          "Findings are reported with coordinates and never fixed silently, because any one of them can be deliberate.",
        ],
      },
      {
        id: "which-exports",
        question: "Which export formats are supported?",
        navLabel: "Exports",
        answer: [
          "Litematica (.litematic) is the primary target: it carries block states and gives you a material list to gather against.",
          "Sponge schematic (.schem), MagicaVoxel (.vox), glTF (.glb) and STL are also available.",
          "Building Gadgets JSON is a later addition.",
        ],
      },
      {
        id: "preview-stairs",
        question: "Why does the preview show stairs and slabs as full blocks?",
        navLabel: "Preview limits",
        answer: [
          "The 3D preview meshes full cubes only. The compiler and every export carry the exact stair, slab and block state, so what you place in the world is correct even where the preview simplifies it.",
          "Sub-cube preview geometry is planned separately.",
        ],
      },
    ],
  },
  {
    id: "account",
    title: "Accounts and data",
    items: [
      {
        id: "do-i-need-an-account",
        question: "Do I need an account?",
        navLabel: "Accounts",
        answer: [
          "No. An account only saves your builds so you can come back to them and re-export them later.",
        ],
      },
      {
        id: "what-happens-when-i-delete",
        question: "What happens when I delete my account?",
        navLabel: "Deleting an account",
        answer: [
          "Your profile is anonymised, your saved builds are marked for removal and their stored files are deleted, and any in-flight generation is cancelled.",
        ],
        links: [{ label: "Privacy policy", href: "/privacy" }],
      },
    ],
  },
];

export const FAQ_ITEMS: readonly FaqItem[] = FAQ_SECTIONS.flatMap((section) => section.items);
