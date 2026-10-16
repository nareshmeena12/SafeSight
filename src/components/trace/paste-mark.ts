import { Mark, mergeAttributes } from "@tiptap/core";
import { Fragment, type MarkType, type Node as PMNode, Slice } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { PASTE_ATTR } from "@/lib/trace/html";

/** Adds `markType` to every text node in a fragment where the parent allows it. */
function markFragment(fragment: Fragment, markType: MarkType, parent: PMNode | null): Fragment {
  const nodes: PMNode[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      const allowed = parent ? parent.type.allowsMarkType(markType) : true;
      nodes.push(allowed ? node.mark(markType.create().addToSet(node.marks)) : node);
    } else {
      nodes.push(node.copy(markFragment(node.content, markType, node)));
    }
  });
  return Fragment.from(nodes);
}

/**
 * Marks pasted (and dropped) text, so Trace can measure how much of the final
 * text arrived by paste and the replay can tint it. Invisible to the student;
 * the teacher view styles `[data-trace-paste]`.
 */
export const PasteMark = Mark.create({
  name: "tracePaste",
  inclusive: false,
  excludes: "",
  keepOnSplit: false,

  parseHTML() {
    return [{ tag: `span[${PASTE_ATTR}]` }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { [PASTE_ATTR]: "" }), 0];
  },

  addProseMirrorPlugins() {
    const markType = this.type;
    return [
      new Plugin({
        key: new PluginKey("tracePaste"),
        props: {
          transformPasted(slice) {
            return new Slice(markFragment(slice.content, markType, null), slice.openStart, slice.openEnd);
          },
        },
      }),
    ];
  },
});
