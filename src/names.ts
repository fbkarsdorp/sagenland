// Whether a first name from the archive's tellers is a woman's or a man's, so the faces can follow it. The metadata
// says nothing about this; the lists are ordinary knowledge of Dutch, Frisian and Flemish first names. Names that
// could be either here (Frisian Anne is a man's name, elsewhere a woman's) or that are unclear stay undecided.

const WOMEN = new Set(`Aaltje Adeline Adèle Adrienne Adronie Aefke Agnes Aimée Aldegonde Alfonsine Alice Alida Alma Amelie
  Anastasie Andrieske Angelique Angèle Anna Anneke Annigje Ant(s)je Antje Antoinetta Antoinette Astasie Augusta Barbara Baukje
  Bernardina Bernice Bertha Bertien Camilla Caroline Catharina Catherina Cathrina Celestine Celina Celine Cesarie Cieke Cille
  Clara Clare Clarisse Clemence Clementine Clotil Clotilde Colet Colette Cornelia Cunegonda Cézarine Delphine Denise Dorothea
  Drika Durkje Dymphna Elisa Elisabeth Eliza Elizabeth Elodie Elvira Elvire Emilienne Emma Emmerence Eugenie Fannie Felicie
  Felicite Fharailde Fieke Fien Fientje Fille Filomeen Fimke Flavie Florentine Florine Fokje Francine Froukje Gabrielle
  Gabriëlle Geertje Geeske Gelske Gepke Georgette Gerardine Germaine Gerritdina Gilberte Godelieve Grietje Gusta Gustavine
  Haebeltje Helena Helene Hendrikje Henriette Hilarie Hilda Hiltje Hinke Hiske Honorine Hortense Hubertina Hylkje IJtje Ida
  Iebeltje Iebeltsje Imca Irma Jacqueline Janke Janna Janny Jantje Jeanine Jeanne Jeannette Jeltje Jitske Joanna Johanna Josefa
  Josephina Josephine Jozefina Julia Julie Julienne Juliette Julma Justine Kamilla Karlien Laura Lea Leida Leinie Leona Leonie
  Leontine Lia Lice Lien Line Lis Lisa Liza Lizette Louisa Louise Louïse Lucie Ludovica Lys Lyske Madeleine Magdalena Malvine
  Margaretha Margriet Marguerite Maria Maria-Johanna Marianne Marie Marie-Clothilde Marie-Jeanne Marie-Louise Marie-Madeleine
  Marina Marta Martha Martsje Mathea Mathilde Melanie Meleen Melia Mena Menje Mie Mies Mina Minke Monika Nathalie Nella Net
  Netteke Octavie Odile Paula Paulina Pauline Pelagie Petronella Pharailde Pharilde Philomena Plien Polien Rachel Rachelle
  Regina Rieka Rinskje Romanie Roos Rosa Rosalie Rozeke Sabine Sidonie Sietske Sijke Simone Simonne Sofie Stans Suzanne Sylvia
  Sylvie Sytske Thérèse Tietje Tineke Tonia Trees Trien Trijntje Tsjitske Valentine Valerie Victoria Victorine Virgenie Virginia
  Virginie Wies Wietske Willemke Wiske Wytske Yvonne Zoë Zulma`.split(/\s+/));

const EITHER = new Set(`Anne Bontje Neel Camille Dom Ealse Emille Fik Gustje Haeije Jeuf Kei Mil Miente Mit Monk Naar Pie Rikele Sjo
  Sooi Sooike Tije Tite Toke Torthé Valeri Van Ware Wis`.split(/\s+/));

/** true for a woman's name, false for a man's, null when it could be either. */
export function isWoman(first: string): boolean | null {
  if (WOMEN.has(first)) return true;
  if (EITHER.has(first)) return null;
  return false;
}
