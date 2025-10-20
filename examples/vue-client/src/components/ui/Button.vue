<script setup lang="ts">
import { cva, type VariantProps } from "class-variance-authority";
import { computed, useAttrs } from "vue";
import { cn } from "../../utils/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-xl font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md hover:from-indigo-700 hover:to-purple-700 focus-visible:ring-indigo-500",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80 focus-visible:ring-secondary",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted focus-visible:ring-muted-foreground/40",
        ghost: "bg-transparent text-foreground hover:bg-muted",
        danger:
          "bg-red-600 text-white shadow-md hover:bg-red-700 focus-visible:ring-red-500",
      },
      size: {
        sm: "h-9 px-4 text-sm",
        md: "h-11 px-6 text-base",
        lg: "h-12 px-8 text-lg",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  },
);

interface ButtonProps extends VariantProps<typeof buttonVariants> {
  as?: "button" | "a";
}

const props = withDefaults(defineProps<ButtonProps>(), {
  as: "button",
  variant: "default",
  size: "md",
});

const attrs = useAttrs();
const tag = computed(() => props.as ?? "button");

const classes = computed(() =>
  cn(
    buttonVariants({ variant: props.variant, size: props.size }),
    (attrs as Record<string, unknown> & { class?: unknown }).class as
      | string
      | undefined,
  ),
);

const passthroughAttrs = computed(() => {
  const { class: _class, ...rest } = attrs as Record<string, unknown> & {
    class?: unknown;
  };

  if (tag.value === "button" && rest.type === undefined) {
    rest.type = "button";
  }

  return rest;
});
</script>

<template>
  <component :is="tag" v-bind="passthroughAttrs" :class="classes">
    <slot />
  </component>
</template>
