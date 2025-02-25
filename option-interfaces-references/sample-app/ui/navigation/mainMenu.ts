import { Menu } from "../../../framework/metadata/menu";
import { createContactView } from "../views/createContact";

export const mainMenu: Menu = {
  items: [
    {
      label: 'Create contact',
      name: 'createContact',
      view: createContactView
    }
  ]
};